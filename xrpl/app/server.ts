import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { SignedOrder } from '../agreement/rental.js'
import type { LoginChallenge } from '../agreement/wallet-login.js'
import type { SimulatedPresetName } from '../shared/demo-contract.js'
import type { VaultResolutionMode } from '../shared/escrow-order.js'
import {
  HttpError,
  RentalPlatformService,
  type LocalDemoRole,
} from './service.js'
import {
  renderBillboardPlayerHtml,
  renderCadPortalHtml,
  renderMarketplaceHtml,
} from './ui.js'
import { createSimulatedRuntime, createTestnetRuntime } from './xrpl-runtime.js'

const COOKIE_NAME = 'affitti_session'
const MAX_JSON_BODY = 1_048_576
const MAX_UPLOAD_BODY = 11 * 1024 * 1024

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(val)
  }
  return out
}

function getSessionRefFromRequest(req: IncomingMessage): string | null {
  const headerRef = req.headers['x-session-ref']
  if (typeof headerRef === 'string' && headerRef.trim()) {
    return headerRef.trim()
  }
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token) return token
  }
  const cookies = parseCookies(req.headers.cookie)
  return cookies[COOKIE_NAME] ?? null
}

function setSessionCookie(res: ServerResponse, sessionRef: string, clear = false): void {
  const cookie = clear
    ? `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    : `${COOKIE_NAME}=${encodeURIComponent(sessionRef)}; Path=/; HttpOnly; SameSite=Lax`
  res.setHeader('Set-Cookie', cookie)
}

async function readRawBody(req: IncomingMessage, limitBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    total += buf.length
    if (total > limitBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds allowed size limit.')
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const buf = await readRawBody(req, MAX_JSON_BODY)
  if (buf.length === 0) return {} as T
  try {
    return JSON.parse(buf.toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Invalid JSON body.')
  }
}

function extractMultipartFile(body: Buffer, contentType: string): Buffer {
  const match = /boundary=([^;\s]+)/i.exec(contentType)
  if (!match?.[1]) {
    throw new HttpError(400, 'INVALID_MULTIPART', 'Missing multipart boundary.')
  }
  const boundary = match[1].replace(/^"(.*)"$/, '$1')
  const marker = Buffer.from(`--${boundary}`)
  const start = body.indexOf(marker)
  if (start < 0) throw new HttpError(400, 'INVALID_MULTIPART', 'Multipart part not found.')
  const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start)
  if (headerEnd < 0) throw new HttpError(400, 'INVALID_MULTIPART', 'Incomplete multipart headers.')
  const contentStart = headerEnd + 4
  const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart)
  if (nextBoundary < 0) throw new HttpError(400, 'INVALID_MULTIPART', 'Missing multipart closing boundary.')
  return body.subarray(contentStart, nextBoundary)
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const payload = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(html)
}

export function createAppServer(service: RentalPlatformService): {
  readonly server: Server
  listen(port?: number, host?: string): Promise<string>
  close(): Promise<void>
} {
  const server = createServer(async (req, res) => {
    try {
      const method = (req.method ?? 'GET').toUpperCase()
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost')
      const pathname = parsedUrl.pathname

      // --- HTML Pages ---
      if (method === 'GET' && pathname === '/') {
        sendHtml(res, 200, renderMarketplaceHtml())
        return
      }
      if (method === 'GET' && pathname === '/cad') {
        sendHtml(res, 200, renderCadPortalHtml())
        return
      }
      const screenMatch = /^\/schermo\/([^/]+)$/.exec(pathname)
      if (method === 'GET' && screenMatch?.[1]) {
        const resourceId = decodeURIComponent(screenMatch[1])
        service.requireResource(resourceId)
        sendHtml(res, 200, renderBillboardPlayerHtml(resourceId))
        return
      }

      // --- Wallet Sessions ---
      if (method === 'POST' && pathname === '/api/wallet/challenge') {
        await readJsonBody(req)
        const existingRef = getSessionRefFromRequest(req) ?? undefined
        const issued = service.issueWalletChallenge(existingRef)
        setSessionCookie(res, issued.sessionRef)
        sendJson(res, 200, issued)
        return
      }
      if (method === 'POST' && pathname === '/api/wallet/session') {
        const body = await readJsonBody<{ id?: string; proof?: unknown; sessionRef?: string }>(req)
        const ref = getSessionRefFromRequest(req) ?? body.sessionRef ?? ''
        if (!body.id || !body.proof) {
          throw new HttpError(400, 'INVALID_LOGIN_PAYLOAD', 'One-time signature id and proof are required.')
        }
        const session = service.verifyWalletSession(ref, body.id, body.proof)
        setSessionCookie(res, session.sessionRef)
        sendJson(res, 200, session)
        return
      }
      if (method === 'GET' && pathname === '/api/wallet/session') {
        sendJson(res, 200, service.getSessionView(getSessionRefFromRequest(req)))
        return
      }
      if (method === 'DELETE' && pathname === '/api/wallet/session') {
        service.logoutSession(getSessionRefFromRequest(req))
        setSessionCookie(res, '', true)
        sendJson(res, 200, { ok: true })
        return
      }

      // --- Local signer helpers for single-PC demo ---
      if (method === 'POST' && pathname === '/api/local-signer/login') {
        const body = await readJsonBody<{ challenge?: LoginChallenge; role?: LocalDemoRole }>(req)
        if (!body.challenge || !body.role) {
          throw new HttpError(400, 'INVALID_LOCAL_SIGN_INPUT', 'challenge and role are required.')
        }
        sendJson(res, 200, service.signLoginLocally(body.challenge, body.role))
        return
      }
      if (method === 'POST' && pathname === '/api/local-signer/proposal') {
        const body = await readJsonBody<{
          resourceId?: string
          listingId?: string
          revision?: number
          startsAt?: string
          endsAt?: string
          priceDrops?: string
          role?: LocalDemoRole
        }>(req)
        if (!body.resourceId || !body.startsAt || !body.endsAt || !body.priceDrops) {
          throw new HttpError(400, 'INVALID_PROPOSAL_INPUT', 'Incomplete proposal fields.')
        }
        sendJson(
          res,
          200,
          service.signProposalLocally({
            resourceId: body.resourceId,
            listingId: body.listingId,
            revision: body.revision,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            priceDrops: body.priceDrops,
            role: body.role,
          }),
        )
        return
      }
      if (method === 'POST' && pathname === '/api/local-signer/order') {
        const body = await readJsonBody<{
          listingId?: string
          revision?: number
          orderId?: string
          fundBy?: string
          role?: LocalDemoRole
        }>(req)
        if (!body.listingId) {
          throw new HttpError(400, 'LISTING_ID_REQUIRED', 'listingId is required.')
        }
        sendJson(
          res,
          200,
          service.signOrderLocally({
            listingId: body.listingId,
            revision: body.revision,
            orderId: body.orderId,
            fundBy: body.fundBy,
            role: body.role,
          }),
        )
        return
      }
      if (method === 'POST' && pathname === '/api/local-signer/vault-signature') {
        const body = await readJsonBody<{ orderId?: string; role?: LocalDemoRole }>(req)
        if (!body.orderId || !body.role) {
          throw new HttpError(400, 'INVALID_MULTISIG_INPUT', 'orderId and role are required.')
        }
        sendJson(res, 200, await service.signVaultPartialLocally(body.orderId, body.role))
        return
      }

      // --- Resources and Access Verification ---
      if (method === 'GET' && pathname === '/api/risorse') {
        sendJson(res, 200, service.listResources())
        return
      }
      const fundsMatch = /^\/api\/risorse\/([^/]+)\/fondi$/.exec(pathname)
      if (method === 'GET' && fundsMatch?.[1]) {
        const funds = await service.getResourceFunds(getSessionRefFromRequest(req), decodeURIComponent(fundsMatch[1]))
        sendJson(res, 200, funds)
        return
      }
      const accessMatch = /^\/api\/risorse\/([^/]+)\/accesso$/.exec(pathname)
      if (method === 'GET' && accessMatch?.[1]) {
        const resourceId = decodeURIComponent(accessMatch[1])
        const decision = await service.evaluateResourceAccess(
          getSessionRefFromRequest(req),
          resourceId,
        )
        sendJson(res, decision.code === 'LEDGER_UNAVAILABLE' ? 503 : 200, decision)
        return
      }

      // --- Listings and Order Acceptance ---
      if (method === 'GET' && pathname === '/api/annunci') {
        sendJson(res, 200, service.listListings())
        return
      }
      if (method === 'POST' && pathname === '/api/annunci') {
        const body = await readJsonBody<{ proposal?: unknown; proof?: unknown }>(req)
        const saved = service.publishListing(getSessionRefFromRequest(req), {
          proposal: body.proposal,
          proof: body.proof,
        })
        sendJson(res, 201, saved)
        return
      }
      const createOrderMatch = /^\/api\/annunci\/([^/]+)\/ordini$/.exec(pathname)
      if (method === 'POST' && createOrderMatch?.[1]) {
        const listingId = decodeURIComponent(createOrderMatch[1])
        const body = await readJsonBody<{ acceptance?: SignedOrder }>(req)
        if (!body.acceptance) {
          throw new HttpError(400, 'ACCEPTANCE_REQUIRED', 'Missing Bob signed acceptance.')
        }
        const created = await service.acceptListingOrder(
          getSessionRefFromRequest(req),
          listingId,
          body.acceptance,
        )
        sendJson(res, 201, created)
        return
      }

      // --- Orders, Decisions, Payments, Recovery ---
      if (method === 'GET' && pathname === '/api/ordini') {
        const resourceId = parsedUrl.searchParams.get('resourceId') ?? undefined
        sendJson(res, 200, await service.listOrderViews(resourceId))
        return
      }
      const orderGetMatch = /^\/api\/ordini\/([^/]+)$/.exec(pathname)
      if (method === 'GET' && orderGetMatch?.[1]) {
        sendJson(res, 200, await service.getOrderView(decodeURIComponent(orderGetMatch[1])))
        return
      }
      const orderDecisionMatch = /^\/api\/ordini\/([^/]+)\/decisione$/.exec(pathname)
      if (method === 'POST' && orderDecisionMatch?.[1]) {
        const body = await readJsonBody<{ decision?: 'approve' | 'reject'; reason?: string }>(req)
        if (body.decision !== 'approve' && body.decision !== 'reject') {
          throw new HttpError(400, 'INVALID_DECISION', 'decision must be approve or reject.')
        }
        const order = await service.decideOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(orderDecisionMatch[1]),
          { decision: body.decision, reason: body.reason },
        )
        sendJson(res, 200, order)
        return
      }
      const acceptPassMatch = /^\/api\/ordini\/([^/]+)\/pass\/accetta$/.exec(pathname)
      if (method === 'POST' && acceptPassMatch?.[1]) {
        const order = await service.acceptPassForOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(acceptPassMatch[1]),
        )
        sendJson(res, 200, order)
        return
      }
      const depositMatch = /^\/api\/ordini\/([^/]+)\/deposito$/.exec(pathname)
      if (method === 'POST' && depositMatch?.[1]) {
        const order = await service.depositEscrowForOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(depositMatch[1]),
        )
        sendJson(res, 200, order)
        return
      }
      const releaseMatch = /^\/api\/ordini\/([^/]+)\/sblocco$/.exec(pathname)
      if (method === 'POST' && releaseMatch?.[1]) {
        const order = await service.releaseEscrowForOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(releaseMatch[1]),
        )
        sendJson(res, 200, order)
        return
      }
      const settleMatch = /^\/api\/ordini\/([^/]+)\/liquidazione$/.exec(pathname)
      if (method === 'POST' && settleMatch?.[1]) {
        const body = await readJsonBody<{
          action?: 'prepare' | 'sign' | 'settle'
          mode?: VaultResolutionMode
          partialTxBlob?: string
          signers?: [LocalDemoRole, LocalDemoRole]
        }>(req)
        const result = await service.settleVaultForOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(settleMatch[1]),
          body,
        )
        sendJson(res, 200, result)
        return
      }
      const recoverMatch = /^\/api\/ordini\/([^/]+)\/recupero$/.exec(pathname)
      if (method === 'POST' && recoverMatch?.[1]) {
        const order = await service.recoverInterruptedOrder(
          getSessionRefFromRequest(req),
          decodeURIComponent(recoverMatch[1]),
        )
        sendJson(res, 200, order)
        return
      }
      const reconcileMatch = /^\/api\/ordini\/([^/]+)\/riconcilia$/.exec(pathname)
      if (method === 'POST' && reconcileMatch?.[1]) {
        const order = await service.reconcileOrder(decodeURIComponent(reconcileMatch[1]))
        sendJson(res, 200, order)
        return
      }

      // --- Protected CAD Portal ---
      const cadProjectMatch = /^\/api\/cad\/([^/]+)\/progetto$/.exec(pathname)
      if (method === 'GET' && cadProjectMatch?.[1]) {
        const data = await service.openCadDemoProject(
          getSessionRefFromRequest(req),
          decodeURIComponent(cadProjectMatch[1]),
        )
        sendJson(res, 200, data)
        return
      }

      // --- Digital Billboard ---
      const bbUploadMatch = /^\/api\/cartelloni\/([^/]+)\/immagine$/.exec(pathname)
      if (method === 'POST' && bbUploadMatch?.[1]) {
        const raw = await readRawBody(req, MAX_UPLOAD_BODY)
        const ctype = (req.headers['content-type'] ?? '').toLowerCase()
        let bytes: Buffer
        if (ctype.startsWith('multipart/form-data')) {
          bytes = extractMultipartFile(raw, req.headers['content-type'] ?? '')
        } else if (ctype.startsWith('application/json')) {
          const json = JSON.parse(raw.toString('utf8')) as { imageBase64?: string }
          bytes = Buffer.from(json.imageBase64 ?? '', 'base64')
        } else {
          bytes = raw
        }
        const pub = await service.uploadBillboardImage(
          getSessionRefFromRequest(req),
          decodeURIComponent(bbUploadMatch[1]),
          bytes,
        )
        sendJson(res, 201, pub)
        return
      }
      const bbCurrentMatch = /^\/api\/cartelloni\/([^/]+)\/corrente$/.exec(pathname)
      if (method === 'GET' && bbCurrentMatch?.[1]) {
        const current = await service.getBillboardCurrent(decodeURIComponent(bbCurrentMatch[1]))
        sendJson(res, 200, current)
        return
      }
      const bbImageMatch = /^\/api\/cartelloni\/([^/]+)\/immagine-file$/.exec(pathname)
      if (method === 'GET' && bbImageMatch?.[1]) {
        const img = await service.getBillboardImageBytes(decodeURIComponent(bbImageMatch[1]))
        if (!img) {
          res.writeHead(404, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        res.writeHead(200, {
          'Content-Type': img.mimeType,
          'Content-Length': img.bytes.length,
          'Cache-Control': 'no-store',
        })
        res.end(img.bytes)
        return
      }

      // --- Simulation, Sample Exchange ---
      if (method === 'GET' && pathname === '/api/simulazione/stato') {
        sendJson(res, 200, service.getSimulationStatus())
        return
      }
      if (method === 'POST' && pathname === '/api/simulazione/preset') {
        const body = await readJsonBody<{ preset?: SimulatedPresetName }>(req)
        if (!body.preset) {
          throw new HttpError(400, 'PRESET_REQUIRED', 'Specify the simulated preset.')
        }
        sendJson(res, 200, await service.applySimulatedPreset(body.preset))
        return
      }
      if (method === 'POST' && pathname === '/api/simulazione/tempo') {
        const body = await readJsonBody<{ seconds?: number }>(req)
        if (typeof body.seconds !== 'number' || !Number.isFinite(body.seconds) || body.seconds < 1) {
          throw new HttpError(400, 'INVALID_SECONDS', 'seconds must be a positive number.')
        }
        sendJson(res, 200, service.advanceSimulatedTime(body.seconds))
        return
      }
      if (method === 'GET' && pathname === '/api/scambio/esempio-cad') {
        sendJson(res, 200, service.getSampleCadExchange())
        return
      }

      sendJson(res, 404, { code: 'NOT_FOUND', message: `Route not found: ${method} ${pathname}` })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.statusCode, { code: error.code, message: error.message })
        return
      }
      const msg = error instanceof Error ? error.message : 'Internal server error.'
      sendJson(res, 500, { code: 'INTERNAL_ERROR', message: msg })
    }
  })

  return {
    server,
    listen(port = 3000, host = '127.0.0.1'): Promise<string> {
      return new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen)
        server.listen(port, host, () => {
          server.removeListener('error', rejectListen)
          const addr = server.address()
          const actualPort = typeof addr === 'object' && addr ? addr.port : port
          resolveListen(`http://${host}:${actualPort}`)
        })
      })
    },
    close(): Promise<void> {
      return new Promise((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()))
      })
    },
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? '3000')
  const host = process.env.HOST ?? '127.0.0.1'
  const domain = process.env.APP_DOMAIN ?? `localhost:${port}`
  const mode = process.env.XRPL_MODE === 'testnet' ? 'testnet' : 'simulated'
  const here = dirname(fileURLToPath(import.meta.url))
  const defaultLocalDir = resolve(here, '..', '..', '.xrpl-local')
  const stateDir = process.env.XRPL_RENTAL_STATE_DIR
    ? resolve(process.env.XRPL_RENTAL_STATE_DIR)
    : defaultLocalDir
  const dataDir = process.env.APP_DATA_DIR
    ? resolve(process.env.APP_DATA_DIR)
    : join(stateDir, mode === 'testnet' ? 'app-testnet' : 'app-sim')

  const runtime =
    mode === 'testnet'
      ? await createTestnetRuntime({ stateDir, nodeName: process.env.XRPL_TESTNET_NODE })
      : await createSimulatedRuntime({ stateDir: join(dataDir, 'xrpl-state') })

  const service = await RentalPlatformService.create({ dataDir, domain, runtime })
  const app = createAppServer(service)
  const baseUrl = await app.listen(port, host)
  process.stdout.write(
    `XRPL Rentals v2 Server (${mode}) started on ${baseUrl}\n` +
      `- Marketplace: ${baseUrl}/\n` +
      `- CAD Portal: ${baseUrl}/cad\n` +
      `- Billboard: ${baseUrl}/schermo/torino-01\n`,
  )

  const shutdown = async () => {
    await app.close()
    service.close()
    await runtime.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
