import { setTimeout as sleep } from 'node:timers/promises'
import type { NFTokenAcceptOffer, NFTokenCreateOffer, NFTokenMint } from 'xrpl'

export type Fields = Record<string, unknown>
export type LedgerRequest = (command: string, fields?: Fields) => Promise<Fields>
export type PassStatus = 'present' | 'absent' | 'unavailable'
export type NftTransaction = NFTokenMint | NFTokenCreateOffer | NFTokenAcceptOffer

export interface PassOrder {
  orderId: string
  aliceAddress: string
  bobAddress: string
  nftId: string
  offerId: string
  offerExpiresAt: string
}

export interface Snapshot {
  hash: string
  index: number
  closeTime: number
}

const rippleEpoch = 946_684_800
const sellFlag = 1

export function record(value: unknown): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Oggetto XRPL o JSON non valido.')
  }
  return value as Fields
}

export function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Fa-f]{64}$/.test(value)
}

export function readHash(value: unknown): string {
  if (!isHash(value)) throw new Error('Identificativo XRPL non valido.')
  return value.toUpperCase()
}

export function readUint32(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('Intero XRPL UInt32 non valido.')
  }
  return value
}

export function rippleTime(utc: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(utc)) {
    throw new Error('Scadenza richiesta in formato UTC ISO 8601 al secondo.')
  }
  const date = new Date(utc)
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== utc.replace('Z', '.000Z')) {
    throw new Error('Scadenza UTC non valida.')
  }
  return readUint32(date.valueOf() / 1000 - rippleEpoch)
}

export async function readValidatedLedger(rpc: LedgerRequest, ledgerId?: string | number): Promise<Snapshot> {
  const hash = typeof ledgerId === 'string' ? readHash(ledgerId) : undefined
  const data = await rpc('ledger', hash ? { ledger_hash: hash } : { ledger_index: ledgerId ?? 'validated' })
  const ledger = record(data.ledger)
  const actualHash = readHash(data.ledger_hash ?? ledger.ledger_hash)
  if (data.validated !== true || (hash && actualHash !== readHash(hash))) {
    throw new Error('Snapshot XRPL non validato o incoerente.')
  }
  const rawIndex = data.ledger_index ?? ledger.ledger_index
  const index = readUint32(typeof rawIndex === 'string' && /^\d+$/.test(rawIndex) ? Number(rawIndex) : rawIndex)
  if (typeof ledgerId === 'number' && index !== ledgerId) throw new Error('Indice del ledger incoerente.')
  return { hash: actualHash, index, closeTime: readUint32(ledger.close_time) }
}

export async function recentSnapshot(rpc: LedgerRequest): Promise<Snapshot> {
  const snapshot = await readValidatedLedger(rpc)
  if (Date.now() / 1000 - (snapshot.closeTime + rippleEpoch) > 30) {
    throw new Error('Il nodo non dispone di un ledger validato recente.')
  }
  return snapshot
}

function assertSnapshot(data: Fields, hash: string) {
  if (readHash(data.ledger_hash) !== hash) {
    throw new Error('La risposta XRPL usa uno snapshot diverso.')
  }
  if (data.validated === false) throw new Error('Il nodo non ha ancora validato lo snapshot richiesto.')
}

async function readAtSnapshot(rpc: LedgerRequest, command: string, fields: Fields, hash: string) {
  const request = { ...fields, ledger_hash: hash }
  let data = await rpc(command, request)
  // A load-balanced node can be briefly behind the instance that supplied the header.
  for (let retry = 0; retry < 2 && data.validated === false && readHash(data.ledger_hash) === hash; retry++) {
    await sleep(500)
    data = await rpc(command, request)
  }
  assertSnapshot(data, hash)
  return data
}

async function findOwnedNft(rpc: LedgerRequest, account: string, nftId: string, hash: string) {
  const markers = new Set<string>()
  let marker: unknown
  do {
    const page = await readAtSnapshot(rpc, 'account_nfts', {
      account,
      ...(marker === undefined ? {} : { marker }),
    }, hash)
    if (page.account !== account || !Array.isArray(page.account_nfts)) {
      throw new Error('Pagina NFT non valida.')
    }
    for (const value of page.account_nfts) {
      const nft = record(value)
      if (readHash(nft.NFTokenID) === nftId) return nft
    }
    marker = page.marker
    if (marker !== undefined) {
      const key = JSON.stringify(marker)
      if (marker === null || markers.has(key)) throw new Error('Paginazione XRPL incoerente.')
      markers.add(key)
    }
  } while (marker !== undefined)
  return undefined
}

/** Bind one node. The caller supplies the validated snapshot also used for escrow. */
export function createPassVerifier(rpc: LedgerRequest) {
  return async function verifyPass(
    order: Pick<PassOrder, 'bobAddress' | 'nftId'>,
    ledgerHash: string,
  ): Promise<PassStatus> {
    try {
      const nft = await findOwnedNft(rpc, order.bobAddress, readHash(order.nftId), readHash(ledgerHash))
      return nft ? 'present' : 'absent'
    } catch {
      return 'unavailable'
    }
  }
}

export function mintTransaction(alice: string, taxon: number, filterId: string, filterVersion: number): NFTokenMint {
  readUint32(taxon)
  if (!['grayscale', 'negative', 'swap-rb'].includes(filterId) || filterVersion !== 1) {
    throw new Error('Filtro o versione fuori dal catalogo demo.')
  }
  return {
    TransactionType: 'NFTokenMint',
    Account: alice,
    NFTokenTaxon: taxon,
    URI: Buffer.from(`urn:ixh26:filter:${filterId}:${filterVersion}`, 'utf8').toString('hex').toUpperCase(),
  }
}

export function offerTransaction(order: Omit<PassOrder, 'offerId'>): NFTokenCreateOffer {
  return {
    TransactionType: 'NFTokenCreateOffer',
    Account: order.aliceAddress,
    NFTokenID: readHash(order.nftId),
    Flags: sellFlag,
    Amount: '0',
    Destination: order.bobAddress,
    Expiration: rippleTime(order.offerExpiresAt),
  }
}

export function acceptTransaction(order: PassOrder): NFTokenAcceptOffer {
  return {
    TransactionType: 'NFTokenAcceptOffer',
    Account: order.bobAddress,
    NFTokenSellOffer: readHash(order.offerId),
  }
}

export function checkOfferWindow(expiresAt: string, snapshot: Snapshot): number {
  const expiry = rippleTime(expiresAt)
  if (expiry <= snapshot.closeTime || Date.now() / 1000 >= expiry + rippleEpoch) {
    throw new Error('L’offerta è scaduta.')
  }
  return expiry
}

export async function checkOffer(rpc: LedgerRequest, order: PassOrder, snapshot: Snapshot): Promise<void> {
  const offerId = readHash(order.offerId)
  const nftId = readHash(order.nftId)
  const expiry = checkOfferWindow(order.offerExpiresAt, snapshot)
  const result = await readAtSnapshot(rpc, 'ledger_entry', { nft_offer: offerId, binary: false }, snapshot.hash)
  const offer = record(result.node)
  if (
    readHash(result.index ?? offer.index) !== offerId || offer.LedgerEntryType !== 'NFTokenOffer' ||
    (readUint32(offer.Flags) & sellFlag) === 0 || offer.Owner !== order.aliceAddress ||
    readHash(offer.NFTokenID) !== nftId || offer.Destination !== order.bobAddress ||
    offer.Amount !== '0' || offer.Expiration !== expiry
  ) {
    throw new Error('L’offerta XRPL non corrisponde ai termini dell’ordine.')
  }
  const nft = await findOwnedNft(rpc, order.aliceAddress, nftId, snapshot.hash)
  if (nft?.Issuer !== order.aliceAddress) {
    throw new Error('Alice deve possedere il pass ed esserne l’emittente.')
  }
}
