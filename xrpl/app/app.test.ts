import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { Wallet } from 'xrpl'
import { LocalSigner } from '../agreement/wallet.js'
import { signLogin } from '../agreement/wallet-login.js'
import { formatUtcSecond, type AccessDecisionView, type SampleOrderExchange } from '../shared/demo-contract.js'
import { createDemoBillboardPng, validateAndDecodeImage } from './image-validator.js'
import { createAppServer } from './server.js'
import { RentalPlatformService, type LocalDemoRole, type OrderView, type ResourceFundsView } from './service.js'
import { SimulatedXrplNode, createSimulatedRuntime } from './xrpl-runtime.js'

function createMinimalValidJpeg(): Buffer {
  // JPEG baseline 1x1 valido: SOI, APP0, DQT, SOF0 (1x1, 1 comp), DHT, SOS, data, EOI.
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x7f, 0x00,
    0xff, 0xd9,
  ])
}

async function createTestHarness(
  t: TestContext,
  options?: { readonly combinedMintOffer?: boolean },
) {
  const rootDir = mkdtempSync(join(tmpdir(), 'ixh26-app-v2-'))
  const dataDir = join(rootDir, 'app-data')
  const xrplDir = join(dataDir, 'xrpl-state')
  const node = new SimulatedXrplNode({ combinedMintOffer: options?.combinedMintOffer ?? false })
  const domain = 'localhost:3000'

  let runtime = await createSimulatedRuntime({ stateDir: xrplDir, node })
  let service = await RentalPlatformService.create({ dataDir, domain, runtime })
  let app = createAppServer(service)
  let baseUrl = await app.listen(0, '127.0.0.1')

  t.after(async () => {
    await app.close()
    service.close()
    await runtime.close()
    rmSync(rootDir, { recursive: true, force: true })
  })

  async function api<T = unknown>(
    path: string,
    opts?: {
      readonly method?: string
      readonly sessionRef?: string
      readonly body?: unknown
      readonly rawBody?: Buffer
      readonly contentType?: string
    },
  ): Promise<{ readonly status: number; readonly data: T }> {
    const headers: Record<string, string> = {}
    if (opts?.sessionRef) headers['x-session-ref'] = opts.sessionRef
    let bodyPayload: BodyInit | undefined
    if (opts?.rawBody !== undefined) {
      headers['content-type'] = opts.contentType ?? 'application/octet-stream'
      bodyPayload = new Uint8Array(opts.rawBody) as unknown as BodyInit
    } else if (opts?.body !== undefined) {
      headers['content-type'] = 'application/json'
      bodyPayload = JSON.stringify(opts.body)
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts?.method ?? 'GET',
      headers,
      body: bodyPayload,
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // testo o HTML
    }
    return { status: res.status, data: data as T }
  }

  async function loginRole(role: LocalDemoRole): Promise<string> {
    const ch = await api<{ sessionRef: string; challenge: Record<string, unknown> }>(
      '/api/wallet/challenge',
      { method: 'POST', body: {} },
    )
    assert.equal(ch.status, 200)
    const signed = await api<{ id: string; proof: unknown }>('/api/local-signer/login', {
      method: 'POST',
      body: { challenge: ch.data.challenge, role },
    })
    assert.equal(signed.status, 200)
    const session = await api<{ authenticated: boolean }>('/api/wallet/session', {
      method: 'POST',
      sessionRef: ch.data.sessionRef,
      body: { id: signed.data.id, proof: signed.data.proof },
    })
    assert.equal(session.status, 200)
    assert.equal(session.data.authenticated, true)
    return ch.data.sessionRef
  }

  async function publishAndAcceptOrder(params: {
    readonly aliceRef: string
    readonly bobRef: string
    readonly resourceId: 'cad' | 'torino-01'
    readonly listingId: string
    readonly revision?: number
    readonly orderId: string
    readonly priceDrops?: string
    readonly startOffsetSec?: number
    readonly endOffsetSec?: number
    readonly fundOffsetSec?: number
  }): Promise<OrderView> {
    const nowSec = Math.floor(node.nowMillis() / 1000)
    const startsAt = formatUtcSecond((nowSec + (params.startOffsetSec ?? 60)) * 1000)
    const endsAt = formatUtcSecond((nowSec + (params.endOffsetSec ?? 180)) * 1000)
    const fundBy = formatUtcSecond((nowSec + (params.fundOffsetSec ?? 30)) * 1000)

    const signedProp = await api<{ proposal: unknown; proof: unknown; proposalHash: string }>(
      '/api/local-signer/proposal',
      {
        method: 'POST',
        body: {
          resourceId: params.resourceId,
          listingId: params.listingId,
          revision: params.revision ?? 1,
          startsAt,
          endsAt,
          priceDrops: params.priceDrops ?? '10000000',
        },
      },
    )
    assert.equal(signedProp.status, 200)

    const pub = await api('/api/annunci', {
      method: 'POST',
      sessionRef: params.aliceRef,
      body: { proposal: signedProp.data.proposal, proof: signedProp.data.proof },
    })
    assert.equal(pub.status, 201)

    const signedOrd = await api('/api/local-signer/order', {
      method: 'POST',
      body: {
        listingId: params.listingId,
        revision: params.revision ?? 1,
        orderId: params.orderId,
        fundBy,
      },
    })
    assert.equal(signedOrd.status, 200)

    const created = await api<OrderView>(`/api/annunci/${params.listingId}/ordini`, {
      method: 'POST',
      sessionRef: params.bobRef,
      body: { acceptance: signedOrd.data },
    })
    assert.equal(created.status, 201)
    return created.data
  }

  async function restartBackend(): Promise<void> {
    await app.close()
    service.close()
    await runtime.close()
    runtime = await createSimulatedRuntime({ stateDir: xrplDir, node })
    service = await RentalPlatformService.create({ dataDir, domain, runtime })
    app = createAppServer(service)
    baseUrl = await app.listen(0, '127.0.0.1')
  }

  return {
    node,
    get service() {
      return service
    },
    get runtime() {
      return runtime
    },
    api,
    loginRole,
    publishAndAcceptOrder,
    restartBackend,
  }
}

test('login monouso, 4 risposte simulate e ordine CAD di esempio 10 / 1 / 9 XRP', async (t) => {
  const h = await createTestHarness(t)

  // Sessione richiesta su endpoint protetti.
  const unauth = await h.api('/api/cad/cad/progetto')
  assert.equal(unauth.status, 401)

  // Verifica consumo monouso e rifiuto di sessionRef errato o firma falsa.
  const ch = await h.api<{ sessionRef: string; challenge: { id: string; domain: string; network: 'testnet'; expiresAt: number; sessionRef: string } }>(
    '/api/wallet/challenge',
    { method: 'POST', body: {} },
  )
  const rogue = new LocalSigner(Wallet.generate())
  const rogueProof = signLogin(ch.data.challenge, 'localhost:3000', rogue, h.node.nowMillis())
  const wrongSession = await h.api('/api/wallet/session', {
    method: 'POST',
    sessionRef: 'other-session-ref',
    body: { id: ch.data.challenge.id, proof: rogueProof },
  })
  assert.equal(wrongSession.status, 401)

  const okLogin = await h.api('/api/wallet/session', {
    method: 'POST',
    sessionRef: ch.data.sessionRef,
    body: { id: ch.data.challenge.id, proof: rogueProof },
  })
  assert.equal(okLogin.status, 200)

  // Riuso della stessa challenge deve fallire.
  const replay = await h.api('/api/wallet/session', {
    method: 'POST',
    sessionRef: ch.data.sessionRef,
    body: { id: ch.data.challenge.id, proof: rogueProof },
  })
  assert.equal(replay.status, 401)

  const aliceRef = await h.loginRole('alice')
  const bobRef = await h.loginRole('bob')

  // Esempio 10 / 1 / 9 XRP per il primo scambio tra A, B e C.
  const sample = await h.api<SampleOrderExchange>('/api/scambio/esempio-cad')
  assert.equal(sample.status, 200)
  assert.equal(sample.data.split.grossDrops, '10000000')
  assert.equal(sample.data.split.feeDrops, '1000000')
  assert.equal(sample.data.split.netDrops, '9000000')
  assert.equal(sample.data.split.summaryXrp, '10 / 1 / 9 XRP')
  assert.ok(sample.data.titleNftId)
  assert.equal(sample.data.vault.signers.length, 3)

  // Le 4 risposte simulate richieste + stato iniziale e licenza scaduta.
  await h.api('/api/simulazione/preset', { method: 'POST', body: { preset: 'pending_authority' } })
  const bobWait = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: bobRef })
  assert.equal(bobWait.data.code, 'WAIT_AUTHORITY')
  assert.equal(bobWait.data.canAccess, false)
  const aliceWait = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: aliceRef })
  assert.equal(aliceWait.data.code, 'ALICE_ACTIVE')
  assert.equal(aliceWait.data.canAccess, true)

  await h.api('/api/simulazione/preset', {
    method: 'POST',
    body: { preset: 'pass_delivered_missing_deposit' },
  })
  const bobNoDep = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: bobRef })
  assert.equal(bobNoDep.data.code, 'PASS_DELIVERED_NO_DEPOSIT')
  assert.match(bobNoDep.data.headline, /Completa il deposito/)

  await h.api('/api/simulazione/preset', { method: 'POST', body: { preset: 'active_rental' } })
  const bobActive = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: bobRef })
  assert.equal(bobActive.data.code, 'BOB_ACTIVE')
  assert.equal(bobActive.data.canAccess, true)
  const aliceSuspended = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', {
    sessionRef: aliceRef,
  })
  assert.equal(aliceSuspended.data.code, 'ALICE_SUSPENDED')
  assert.equal(aliceSuspended.data.canAccess, false)
  assert.match(aliceSuspended.data.headline, /Hai affittato la tua licenza a Bob fino al/)

  await h.api('/api/simulazione/preset', { method: 'POST', body: { preset: 'expired_rental' } })
  const bobExpired = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: bobRef })
  assert.equal(bobExpired.data.code, 'RENTAL_EXPIRED')
  assert.equal(bobExpired.data.canAccess, false)
  const aliceRecovered = await h.api<AccessDecisionView>('/api/risorse/cad/accesso', {
    sessionRef: aliceRef,
  })
  assert.equal(aliceRecovered.data.code, 'ALICE_ACTIVE')
  assert.equal(aliceRecovered.data.canAccess, true)

  await h.api('/api/simulazione/preset', {
    method: 'POST',
    body: { preset: 'expired_rental_and_license' },
  })
  assert.equal(
    (await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: aliceRef })).data.code,
    'LICENSE_EXPIRED',
  )
  assert.equal(
    (await h.api<AccessDecisionView>('/api/risorse/cad/accesso', { sessionRef: bobRef })).data.code,
    'RENTAL_EXPIRED',
  )
})

test('Prova 1 · Veto dell’ente, rifiuto motivato e nuova revisione con nuovo consenso di Bob', async (t) => {
  const h = await createTestHarness(t)
  const aliceRef = await h.loginRole('alice')
  const bobRef = await h.loginRole('bob')
  const cadRef = await h.loginRole('cad')
  const comuneRef = await h.loginRole('comune')

  const ord1 = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'cad',
    listingId: 'cad-veto-listing',
    revision: 1,
    orderId: 'ord-veto-1',
    priceDrops: '15000000',
  })
  assert.equal(ord1.status, 'awaiting_authority')

  // Finché l'ente non approva, Bob resta escluso anche chiamando direttamente /api/cad/cad/progetto.
  const deniedProj = await h.api('/api/cad/cad/progetto', { sessionRef: bobRef })
  assert.equal(deniedProj.status, 403)

  // L'ente dell'altra demo (Comune) non può decidere su CAD.
  const wrongAuth = await h.api(`/api/ordini/${ord1.orderId}/decisione`, {
    method: 'POST',
    sessionRef: comuneRef,
    body: { decision: 'approve' },
  })
  assert.equal(wrongAuth.status, 403)

  // L'ente CAD rifiuta con motivazione.
  const rej = await h.api<OrderView>(`/api/ordini/${ord1.orderId}/decisione`, {
    method: 'POST',
    sessionRef: cadRef,
    body: { decision: 'reject', reason: 'Prezzo eccessivo per la finestra scelta' },
  })
  assert.equal(rej.status, 200)
  assert.equal(rej.data.status, 'rejected')
  assert.equal(rej.data.rejectionReason, 'Prezzo eccessivo per la finestra scelta')
  assert.equal(rej.data.calendarHeld, false)
  assert.equal(rej.data.vaultHeld, false)

  // La vecchia accettazione non autorizza una nuova revisione di Alice.
  const nowSec = Math.floor(h.node.nowMillis() / 1000)
  const propRev2 = await h.api<{ proposal: unknown; proof: unknown }>('/api/local-signer/proposal', {
    method: 'POST',
    body: {
      resourceId: 'cad',
      listingId: 'cad-veto-listing',
      revision: 2,
      startsAt: formatUtcSecond((nowSec + 60) * 1000),
      endsAt: formatUtcSecond((nowSec + 180) * 1000),
      priceDrops: '10000000',
    },
  })
  assert.equal(
    (
      await h.api('/api/annunci', {
        method: 'POST',
        sessionRef: aliceRef,
        body: propRev2.data,
      })
    ).status,
    201,
  )

  const staleAccept = await h.api('/api/local-signer/order', {
    method: 'POST',
    body: {
      listingId: 'cad-veto-listing',
      revision: 1,
      orderId: 'ord-stale',
      fundBy: formatUtcSecond((nowSec + 30) * 1000),
    },
  })
  const staleRes = await h.api('/api/annunci/cad-veto-listing/ordini', {
    method: 'POST',
    sessionRef: bobRef,
    body: { acceptance: staleAccept.data },
  })
  assert.equal(staleRes.status, 409)

  // Nuova accettazione di Bob su revisione 2 riesce.
  const freshAccept = await h.api('/api/local-signer/order', {
    method: 'POST',
    body: {
      listingId: 'cad-veto-listing',
      revision: 2,
      orderId: 'ord-veto-2',
      fundBy: formatUtcSecond((nowSec + 30) * 1000),
    },
  })
  const freshRes = await h.api<OrderView>('/api/annunci/cad-veto-listing/ordini', {
    method: 'POST',
    sessionRef: bobRef,
    body: { acceptance: freshAccept.data },
  })
  assert.equal(freshRes.status, 201)
  assert.equal(freshRes.data.revision, 2)
  assert.equal(freshRes.data.priceDrops, '10000000')
})

test('Concorrenza su calendario e vincolo univoco SQLite sul vault, parallelo sul secondo vault e riuso', async (t) => {
  const h = await createTestHarness(t)
  const aliceRef = await h.loginRole('alice')
  const bobRef = await h.loginRole('bob')
  const cadRef = await h.loginRole('cad')

  const ord1 = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'cad',
    listingId: 'cad-c1',
    orderId: 'ord-cad-c1',
    startOffsetSec: 60,
    endOffsetSec: 120,
    fundOffsetSec: 30,
  })

  // Un secondo ordine sullo stesso periodo riceve 409.
  const nowSec = Math.floor(h.node.nowMillis() / 1000)
  const overlapProp = await h.api<{ proposal: unknown; proof: unknown }>('/api/local-signer/proposal', {
    method: 'POST',
    body: {
      resourceId: 'cad',
      listingId: 'cad-c2',
      revision: 1,
      startsAt: formatUtcSecond((nowSec + 90) * 1000),
      endsAt: formatUtcSecond((nowSec + 150) * 1000),
      priceDrops: '10000000',
    },
  })
  await h.api('/api/annunci', { method: 'POST', sessionRef: aliceRef, body: overlapProp.data })
  const overlapOrd = await h.api('/api/local-signer/order', {
    method: 'POST',
    body: { listingId: 'cad-c2', orderId: 'ord-cad-c2', fundBy: formatUtcSecond((nowSec + 30) * 1000) },
  })
  const overlapRes = await h.api<{ code: string }>('/api/annunci/cad-c2/ordini', {
    method: 'POST',
    sessionRef: bobRef,
    body: { acceptance: overlapOrd.data },
  })
  assert.equal(overlapRes.status, 409)
  assert.equal(overlapRes.data.code, 'PERIOD_ALREADY_RESERVED')

  // Un ordine per periodo contiguo [t+120, t+180) mentre ord1 è aperto sullo stesso vault riceve 409 VAULT_BUSY.
  const adjProp = await h.api<{ proposal: unknown; proof: unknown }>('/api/local-signer/proposal', {
    method: 'POST',
    body: {
      resourceId: 'cad',
      listingId: 'cad-adj',
      revision: 1,
      startsAt: formatUtcSecond((nowSec + 120) * 1000),
      endsAt: formatUtcSecond((nowSec + 180) * 1000),
      priceDrops: '10000000',
    },
  })
  await h.api('/api/annunci', { method: 'POST', sessionRef: aliceRef, body: adjProp.data })
  const adjOrd = await h.api('/api/local-signer/order', {
    method: 'POST',
    body: { listingId: 'cad-adj', orderId: 'ord-cad-adj', fundBy: formatUtcSecond((nowSec + 30) * 1000) },
  })
  const adjBusy = await h.api<{ code: string }>('/api/annunci/cad-adj/ordini', {
    method: 'POST',
    sessionRef: bobRef,
    body: { acceptance: adjOrd.data },
  })
  assert.equal(adjBusy.status, 409)
  assert.equal(adjBusy.data.code, 'VAULT_BUSY')

  // Il secondo scenario (cartellone torino-01) può procedere in parallelo sul suo vault.
  const bbOrd = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'torino-01',
    listingId: 'bb-parallel',
    orderId: 'ord-bb-parallel',
    startOffsetSec: 60,
    endOffsetSec: 120,
    fundOffsetSec: 30,
  })
  assert.equal(bbOrd.scenario, 'billboard')

  // Completa e chiudi ord1 su CAD, poi verifica che il periodo contiguo sul medesimo vault riesca.
  await h.api(`/api/ordini/${ord1.orderId}/decisione`, {
    method: 'POST',
    sessionRef: cadRef,
    body: { decision: 'approve' },
  })
  await h.api(`/api/ordini/${ord1.orderId}/pass/accetta`, { method: 'POST', sessionRef: bobRef })
  await h.api(`/api/ordini/${ord1.orderId}/deposito`, { method: 'POST', sessionRef: bobRef })
  h.node.advanceSeconds(130)
  await h.api(`/api/ordini/${ord1.orderId}/sblocco`, { method: 'POST', sessionRef: aliceRef })
  await h.api(`/api/ordini/${ord1.orderId}/liquidazione`, {
    method: 'POST',
    sessionRef: aliceRef,
    body: { action: 'settle', mode: 'ordinary' },
  })

  // Ora il vault CAD è libero e [t+120, t+180) non si sovrappone con ord1 (che era [t+60, t+120)).
  // Con orologio attuale a now+130s, creiamo un nuovo ordine contiguo/futuro [t+180, t+240).
  const nowSec2 = Math.floor(h.node.nowMillis() / 1000)
  const reuseOrd = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'cad',
    listingId: 'cad-reuse',
    orderId: 'ord-cad-reuse',
    startOffsetSec: 50,
    endOffsetSec: 110,
    fundOffsetSec: 20,
  })
  assert.equal(reuseOrd.vault, ord1.vault)
  assert.ok(nowSec2 > nowSec)
})

for (const combinedMintOffer of [false, true]) {
  test(`Prova 2 · Affitto CAD completo 10/1/9 XRP, manomissione SQLite e liquidazione 2-su-3 (mintOffer=${combinedMintOffer})`, async (t) => {
    const h = await createTestHarness(t, { combinedMintOffer })
    const aliceRef = await h.loginRole('alice')
    const bobRef = await h.loginRole('bob')
    const cadRef = await h.loginRole('cad')

    const aliceAddr = h.runtime.setup.participants.alice
    const bobAddr = h.runtime.setup.participants.bob
    const authAddr = h.runtime.setup.participants.cadAuthority
    const fundsPath = '/api/risorse/cad/fondi'
    async function funds() {
      const response = await h.api<ResourceFundsView>(fundsPath, { sessionRef: bobRef })
      assert.equal(response.status, 200)
      assert.ok(response.data.ledgerIndex > 0)
      return response.data
    }

    assert.equal((await h.api(fundsPath)).status, 401)
    const initialFunds = await funds()
    assert.equal(initialFunds.accounts.alice?.balanceDrops, h.node.getBalanceDrops(aliceAddr).toString())
    assert.equal(initialFunds.accounts.bob?.balanceDrops, h.node.getBalanceDrops(bobAddr).toString())
    assert.equal(initialFunds.escrow.lockedDrops, '0')

    // Prima dell'affitto: Alice apre il progetto, Bob è escluso.
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: aliceRef })).status, 200)
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: bobRef })).status, 403)

    const order = await h.publishAndAcceptOrder({
      aliceRef,
      bobRef,
      resourceId: 'cad',
      listingId: 'cad-full',
      orderId: 'ord-cad-full',
      priceDrops: '10000000',
      startOffsetSec: 60,
      endOffsetSec: 180,
      fundOffsetSec: 30,
    })

    const approved = await h.api<OrderView>(`/api/ordini/${order.orderId}/decisione`, {
      method: 'POST',
      sessionRef: cadRef,
      body: { decision: 'approve' },
    })
    assert.equal(approved.status, 200)
    assert.ok(approved.data.receipts.passNftId)
    assert.ok(approved.data.receipts.offerId)
    assert.equal(
      approved.data.receipts.mintTxHash === approved.data.receipts.offerTxHash,
      combinedMintOffer,
    )

    const authBalBefore = h.node.getBalanceDrops(authAddr)
    const accepted = await h.api<OrderView>(`/api/ordini/${order.orderId}/pass/accetta`, {
      method: 'POST',
      sessionRef: bobRef,
    })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.data.status, 'pass_delivered_unfunded')
    assert.equal(h.node.getBalanceDrops(authAddr) - authBalBefore, 1_000_000n)
    const afterFee = await funds()
    assert.ok(afterFee.ledgerIndex > initialFunds.ledgerIndex)
    assert.equal(afterFee.accounts.bob?.balanceDrops, h.node.getBalanceDrops(bobAddr).toString())
    assert.equal(afterFee.escrow.lockedDrops, '0')

    // Manomissione diretta su SQLite senza deposito escrow sul ledger non abilita Bob.
    h.service.store.db
      .prepare("UPDATE orders SET status = 'confirmed', createHash = ? WHERE orderId = ?")
      .run('9'.repeat(64), order.orderId)
    h.node.advanceSeconds(70)
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: bobRef })).status, 403)
    // Ripristina stato coerente e riporta orologio prima della scadenza per completare il deposito vero.
    h.service.store.db
      .prepare("UPDATE orders SET status = 'pass_delivered_unfunded', createHash = NULL WHERE orderId = ?")
      .run(order.orderId)
    h.node.setNowMillis(h.node.nowMillis() - 65_000)

    const deposited = await h.api<OrderView>(`/api/ordini/${order.orderId}/deposito`, {
      method: 'POST',
      sessionRef: bobRef,
    })
    assert.equal(deposited.status, 200)
    assert.equal(deposited.data.status, 'confirmed')
    assert.ok(deposited.data.receipts.createHash)
    assert.ok(deposited.data.receipts.escrowObjectId)
    const afterDeposit = await funds()
    assert.equal(afterDeposit.escrow.state, 'locked')
    assert.equal(afterDeposit.escrow.lockedDrops, '9000000')
    assert.deepEqual(afterDeposit.accounts.vault, initialFunds.accounts.vault)
    assert.equal(afterDeposit.accounts.bob?.balanceDrops, h.node.getBalanceDrops(bobAddr).toString())
    assert.ok(BigInt(afterDeposit.accounts.bob!.spendableDrops) < BigInt(afterDeposit.accounts.bob!.balanceDrops))

    // Prima dell'inizio: Alice accede ancora, Bob riceve 409 CONFIRMED_BEFORE_START.
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: aliceRef })).status, 200)
    const beforeStart = await h.api<{ code: string }>('/api/cad/cad/progetto', { sessionRef: bobRef })
    assert.equal(beforeStart.status, 409)
    assert.equal(beforeStart.data.code, 'CONFIRMED_BEFORE_START')

    // All'inizio del periodo: Bob apre il progetto, Alice è sospesa, sblocco anticipato respinto.
    h.node.advanceSeconds(70)
    const bobOpen = await h.api<{ project: { projectId: string } }>('/api/cad/cad/progetto', {
      sessionRef: bobRef,
    })
    assert.equal(bobOpen.status, 200)
    assert.equal(bobOpen.data.project.projectId, 'cad-assieme-riduttore-2026')

    const aliceBlocked = await h.api<{ code: string; message: string }>('/api/cad/cad/progetto', {
      sessionRef: aliceRef,
    })
    assert.equal(aliceBlocked.status, 403)
    assert.equal(aliceBlocked.data.code, 'ALICE_SUSPENDED')
    assert.match(aliceBlocked.data.message, /sospese/)

    // Un pass CAD non autorizza mai il cartellone torino-01.
    assert.equal(
      (
        await h.api('/api/cartelloni/torino-01/immagine', {
          method: 'POST',
          sessionRef: bobRef,
          rawBody: createDemoBillboardPng(64, 36),
          contentType: 'image/png',
        })
      ).status,
      403,
    )

    // Sblocco anticipato prima della scadenza rifiutato.
    assert.equal(
      (await h.api(`/api/ordini/${order.orderId}/sblocco`, { method: 'POST', sessionRef: aliceRef }))
        .status,
      409,
    )

    // Alla scadenza: Bob perde accesso subito (anche prima delle firme), Alice recupera.
    h.node.advanceSeconds(120)
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: bobRef })).status, 403)
    assert.equal((await h.api('/api/cad/cad/progetto', { sessionRef: aliceRef })).status, 200)

    const aliceBalBeforePayout = h.node.getBalanceDrops(aliceAddr)
    const rel = await h.api<OrderView>(`/api/ordini/${order.orderId}/sblocco`, {
      method: 'POST',
      sessionRef: aliceRef,
    })
    assert.equal(rel.status, 200)
    assert.equal(rel.data.settlement.escrowState, 'credited_to_vault')
    const afterRelease = await funds()
    assert.deepEqual(afterRelease.escrow, { state: 'credited_to_vault', lockedDrops: '0', creditedDrops: '9000000' })
    assert.equal(BigInt(afterRelease.accounts.vault!.balanceDrops) - BigInt(afterDeposit.accounts.vault!.balanceDrops), 9_000_000n)

    // Raccolta firme 2 su 3: 1 firma lascia in attesa di firma; 2 firme pagano tutti i 9 XRP ad Alice.
    const prep = await h.api<{ progress: { phase: string } }>(
      `/api/ordini/${order.orderId}/liquidazione`,
      { method: 'POST', sessionRef: aliceRef, body: { action: 'prepare', mode: 'ordinary' } },
    )
    assert.equal(prep.status, 200)
    assert.equal(prep.data.progress.phase, 'awaiting_signatures')

    const sig1 = await h.api<{ tx_blob: string }>('/api/local-signer/vault-signature', {
      method: 'POST',
      body: { orderId: order.orderId, role: 'alice' },
    })
    const after1 = await h.api<{ progress: { phase: string; collectedSigners?: string[] } }>(
      `/api/ordini/${order.orderId}/liquidazione`,
      { method: 'POST', sessionRef: aliceRef, body: { action: 'sign', partialTxBlob: sig1.data.tx_blob } },
    )
    assert.equal(after1.data.progress.phase, 'awaiting_signatures')
    assert.deepEqual(after1.data.progress.collectedSigners, [aliceAddr])

    const sig2 = await h.api<{ tx_blob: string }>('/api/local-signer/vault-signature', {
      method: 'POST',
      body: { orderId: order.orderId, role: 'bob' },
    })
    const after2 = await h.api<{ order: OrderView; progress: { phase: string } }>(
      `/api/ordini/${order.orderId}/liquidazione`,
      { method: 'POST', sessionRef: bobRef, body: { action: 'sign', partialTxBlob: sig2.data.tx_blob } },
    )
    assert.equal(after2.data.progress.phase, 'validated')
    assert.equal(after2.data.order.status, 'settled')
    assert.equal(after2.data.order.vaultHeld, false)
    assert.equal(after2.data.order.receipts.payoutDeliveredDrops, '9000000')
    assert.equal(h.node.getBalanceDrops(aliceAddr) - aliceBalBeforePayout, 9_000_000n)
    const afterPayout = await funds()
    assert.deepEqual(afterPayout.payout, { beneficiary: 'alice', deliveredDrops: '9000000' })
    assert.equal(BigInt(afterPayout.accounts.alice!.balanceDrops) - BigInt(afterRelease.accounts.alice!.balanceDrops), 9_000_000n)

    // Test arbitrato a favore di Bob su un secondo ordine: Ente + Bob firmano e 9 XRP tornano a Bob.
    const bobBalBeforeArb = h.node.getBalanceDrops(bobAddr)
    const arbOrder = await h.publishAndAcceptOrder({
      aliceRef,
      bobRef,
      resourceId: 'cad',
      listingId: 'cad-arb',
      orderId: 'ord-cad-arb',
      priceDrops: '10000000',
      startOffsetSec: 60,
      endOffsetSec: 180,
      fundOffsetSec: 30,
    })
    await h.api(`/api/ordini/${arbOrder.orderId}/decisione`, {
      method: 'POST',
      sessionRef: cadRef,
      body: { decision: 'approve' },
    })
    await h.api(`/api/ordini/${arbOrder.orderId}/pass/accetta`, { method: 'POST', sessionRef: bobRef })
    await h.api(`/api/ordini/${arbOrder.orderId}/deposito`, { method: 'POST', sessionRef: bobRef })
    h.node.advanceSeconds(190)
    await h.api(`/api/ordini/${arbOrder.orderId}/sblocco`, { method: 'POST', sessionRef: bobRef })
    const arbSettle = await h.api<{ order: OrderView }>(
      `/api/ordini/${arbOrder.orderId}/liquidazione`,
      {
        method: 'POST',
        sessionRef: cadRef,
        body: { action: 'settle', mode: 'arbitration_bob', signers: ['cad', 'bob'] },
      },
    )
    assert.equal(arbSettle.status, 200)
    assert.equal(arbSettle.data.order.status, 'settled')
    assert.equal(arbSettle.data.order.receipts.payoutBeneficiary, bobAddr)
    // Bob ha speso 10 XRP (1 XRP fee + 9 XRP escrow) + piccole tx fee e ha recuperato 9 XRP.
    assert.ok(bobBalBeforeArb - h.node.getBalanceDrops(bobAddr) < 1_001_000n)
  })
}

test('Prova 3 · Cartellone torino-01 (bianco -> PNG/JPEG -> bianco), 503 offline, recupero interrotto e riavvio', async (t) => {
  const h = await createTestHarness(t)
  const aliceRef = await h.loginRole('alice')
  const bobRef = await h.loginRole('bob')
  const comuneRef = await h.loginRole('comune')
  const bobAddr = h.runtime.setup.participants.bob

  // 1. Player iniziale bianco senza pulsanti né login.
  const screenHtml = await h.api<string>('/schermo/torino-01')
  assert.equal(screenHtml.status, 200)
  assert.match(screenHtml.data, /#ffffff/)
  assert.doesNotMatch(screenHtml.data, /<button/)
  const curInit = await h.api<{ active: boolean; imageUrl: string | null }>(
    '/api/cartelloni/torino-01/corrente',
  )
  assert.equal(curInit.data.active, false)
  assert.equal(curInit.data.imageUrl, null)

  // 2. Affitto sul secondo vault (torino-01).
  const bbOrder = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'torino-01',
    listingId: 'bb-main',
    orderId: 'ord-bb-main',
    startOffsetSec: 60,
    endOffsetSec: 180,
    fundOffsetSec: 30,
  })
  await h.api(`/api/ordini/${bbOrder.orderId}/decisione`, {
    method: 'POST',
    sessionRef: comuneRef,
    body: { decision: 'approve' },
  })
  await h.api(`/api/ordini/${bbOrder.orderId}/pass/accetta`, { method: 'POST', sessionRef: bobRef })
  await h.api(`/api/ordini/${bbOrder.orderId}/deposito`, { method: 'POST', sessionRef: bobRef })

  // Entra nella finestra attiva: ancora bianco finché Bob non pubblica.
  h.node.advanceSeconds(70)
  assert.equal(
    (await h.api<{ active: boolean }>('/api/cartelloni/torino-01/corrente')).data.active,
    false,
  )

  // Rifiuta file non decodificabili e tentativi di utenti non autorizzati.
  const badUpload = await h.api('/api/cartelloni/torino-01/immagine', {
    method: 'POST',
    sessionRef: bobRef,
    rawBody: Buffer.from('not-an-image'),
    contentType: 'image/png',
  })
  assert.equal(badUpload.status, 400)

  const pngBytes = createDemoBillboardPng(160, 90)
  assert.equal(validateAndDecodeImage(pngBytes).format, 'png')
  const upOk = await h.api('/api/cartelloni/torino-01/immagine', {
    method: 'POST',
    sessionRef: bobRef,
    rawBody: pngBytes,
    contentType: 'image/png',
  })
  assert.equal(upOk.status, 201)

  const curActive = await h.api<{ active: boolean; imageUrl: string; width: number; height: number }>(
    '/api/cartelloni/torino-01/corrente',
  )
  assert.equal(curActive.data.active, true)
  assert.equal(curActive.data.width, 160)
  assert.equal(curActive.data.height, 90)

  const imgFetch = await h.api(curActive.data.imageUrl)
  assert.equal(imgFetch.status, 200)

  // Tentativo respinto di Alice lascia attiva l'immagine legittima di Bob.
  const aliceUpload = await h.api('/api/cartelloni/torino-01/immagine', {
    method: 'POST',
    sessionRef: aliceRef,
    rawBody: createMinimalValidJpeg(),
    contentType: 'image/jpeg',
  })
  assert.equal(aliceUpload.status, 403)
  assert.equal(
    (await h.api<{ active: boolean; width: number }>('/api/cartelloni/torino-01/corrente')).data
      .width,
    160,
  )

  // Test upload JPEG valido sempre durante la finestra attiva di Bob.
  const jpegUpload = await h.api('/api/cartelloni/torino-01/immagine', {
    method: 'POST',
    sessionRef: bobRef,
    rawBody: createMinimalValidJpeg(),
    contentType: 'image/jpeg',
  })
  assert.equal(jpegUpload.status, 201)
  assert.equal(
    (await h.api<{ mimeType: string }>('/api/cartelloni/torino-01/corrente')).data.mimeType,
    'image/jpeg',
  )

  // Verifica 503 quando il ledger è indisponibile.
  h.node.setAvailable(false)
  const offlineAccess = await h.api<{ code: string }>('/api/risorse/cad/accesso', {
    sessionRef: aliceRef,
  })
  assert.equal(offlineAccess.status, 503)
  assert.equal(offlineAccess.data.code, 'LEDGER_UNAVAILABLE')
  h.node.setAvailable(true)

  // Alla scadenza il cartellone torna bianco anche prima della liquidazione.
  h.node.advanceSeconds(120)
  const curAfterExpiry = await h.api<{ active: boolean; imageUrl: string | null }>(
    '/api/cartelloni/torino-01/corrente',
  )
  assert.equal(curAfterExpiry.data.active, false)
  assert.equal(curAfterExpiry.data.imageUrl, null)
  assert.equal((await h.api('/api/cartelloni/torino-01/immagine-file')).status, 404)

  await h.api(`/api/ordini/${bbOrder.orderId}/sblocco`, { method: 'POST', sessionRef: aliceRef })
  await h.api(`/api/ordini/${bbOrder.orderId}/liquidazione`, {
    method: 'POST',
    sessionRef: aliceRef,
    body: { action: 'settle', mode: 'ordinary' },
  })

  // 3. Ordine con checkout interrotto dopo consegna del pass -> perdita risposta sul rimborso -> riavvio -> ripresa unica.
  const abortedOrder = await h.publishAndAcceptOrder({
    aliceRef,
    bobRef,
    resourceId: 'torino-01',
    listingId: 'bb-abort-1',
    orderId: 'ord-bb-abort-1',
    startOffsetSec: 60,
    endOffsetSec: 180,
    fundOffsetSec: 30,
  })
  await h.api(`/api/ordini/${abortedOrder.orderId}/decisione`, {
    method: 'POST',
    sessionRef: comuneRef,
    body: { decision: 'approve' },
  })
  await h.api(`/api/ordini/${abortedOrder.orderId}/pass/accetta`, {
    method: 'POST',
    sessionRef: bobRef,
  })

  const bobBalAfterFee = h.node.getBalanceDrops(bobAddr)
  h.node.advanceSeconds(40) // oltre fundBy

  // Simula perdita di risposta / transazione in attesa su NFTokenBurn, poi riavvio tra burn e rimborso fee!
  h.node.setAutoValidateSubmits(false)
  h.node.loseNextSubmit()
  const rec1 = await h.api<OrderView>(`/api/ordini/${abortedOrder.orderId}/recupero`, {
    method: 'POST',
    sessionRef: comuneRef,
  })
  assert.equal(rec1.status, 200)
  assert.equal(rec1.data.status, 'recovery_verifying')
  assert.equal(rec1.data.pendingStep, 'revoke_pass')
  assert.equal(rec1.data.vaultHeld, true)

  // Il ledger valida il burn pendente mentre il server è stato riavviato: al riavvio riconcilia burn ed esegue solo il rimborso mancante!
  await h.restartBackend()
  h.node.setAutoValidateSubmits(true)
  h.node.flushPendingSubmits()

  const bobRefAfterRestart = await h.loginRole('bob')
  const comuneRefAfterRestart = await h.loginRole('comune')
  const rec2 = await h.api<OrderView>(`/api/ordini/${abortedOrder.orderId}/recupero`, {
    method: 'POST',
    sessionRef: comuneRefAfterRestart,
  })
  assert.equal(rec2.status, 200)
  assert.equal(rec2.data.status, 'revoked_refunded')
  assert.equal(rec2.data.vaultHeld, false)
  assert.equal(rec2.data.calendarHeld, false)
  assert.equal(rec2.data.receipts.feeRefundDue, true)
  assert.ok(rec2.data.receipts.burnTxHash)
  assert.ok(rec2.data.receipts.refundTxHash)
  assert.notEqual(rec2.data.receipts.burnTxHash, rec2.data.receipts.refundTxHash)
  assert.equal(h.node.getBalanceDrops(bobAddr) - bobBalAfterFee, 1_000_000n)

  // Chiamare nuovamente /recupero è idempotente e non effettua un secondo rimborso.
  const recRepeat = await h.api<OrderView>(`/api/ordini/${abortedOrder.orderId}/recupero`, {
    method: 'POST',
    sessionRef: comuneRefAfterRestart,
  })
  assert.equal(recRepeat.status, 200)
  assert.equal(h.node.getBalanceDrops(bobAddr) - bobBalAfterFee, 1_000_000n)

  // 4. Offerta scaduta senza accettazione di Bob -> burn senza Owner, nessun addebito né rimborso.
  const aliceRefAfterRestart = await h.loginRole('alice')
  const unacceptedOrder = await h.publishAndAcceptOrder({
    aliceRef: aliceRefAfterRestart,
    bobRef: bobRefAfterRestart,
    resourceId: 'torino-01',
    listingId: 'bb-unaccepted',
    orderId: 'ord-bb-unaccepted',
    startOffsetSec: 60,
    endOffsetSec: 180,
    fundOffsetSec: 30,
  })
  await h.api(`/api/ordini/${unacceptedOrder.orderId}/decisione`, {
    method: 'POST',
    sessionRef: comuneRefAfterRestart,
    body: { decision: 'approve' },
  })
  h.node.advanceSeconds(40)
  const bobBalBeforeUnpaidRevoke = h.node.getBalanceDrops(bobAddr)
  const recUnpaid = await h.api<OrderView>(`/api/ordini/${unacceptedOrder.orderId}/recupero`, {
    method: 'POST',
    sessionRef: comuneRefAfterRestart,
  })
  assert.equal(recUnpaid.status, 200)
  assert.equal(recUnpaid.data.status, 'revoked_unpaid')
  assert.equal(recUnpaid.data.receipts.feeRefundDue, false)
  assert.ok(recUnpaid.data.receipts.burnTxHash)
  assert.equal(recUnpaid.data.receipts.refundTxHash, null)
  assert.equal(recUnpaid.data.vaultHeld, false)
  assert.equal(h.node.getBalanceDrops(bobAddr), bobBalBeforeUnpaidRevoke)
})
