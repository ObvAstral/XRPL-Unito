import { createHash } from 'node:crypto'
import { toUSVString } from 'node:util'
import { isValidClassicAddress } from 'xrpl'
import { readHash, rippleTime } from '../nft/pass.js'
import { canonicalJson } from './json.js'
import { verifyWalletSignature, type LocalSigner, type WalletSignature } from './wallet.js'

const version = 2
const network = 'testnet'
const proposalProtocol = 'xrpl-unito:rental-proposal'
const orderProtocol = 'xrpl-unito:rental-order'
const splitRule = 'floor-bps'

export type TitleTerms = {
  resourceId: string
  issuer: string
  alice: string
  validFrom: string
  validTo: string
}
export type RentalResource = TitleTerms & { titleNftId: string; vault: string }

function shape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('Sono richiesti termini JSON.')
  }
  const fields = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(fields).length !== keys.length
    || !keys.every((key) => fields[key]?.enumerable && Object.hasOwn(fields[key], 'value'))) {
    throw new Error('Campi attesi: ' + keys.join(', '))
  }
  return value as Record<string, unknown>
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128 || value.trim() !== value
    || toUSVString(value) !== value || /[\p{Cc}\p{Bidi_Control}]/u.test(value)) {
    throw new Error('Identificativo applicativo non valido.')
  }
  return value
}

function address(value: unknown): string {
  if (typeof value !== 'string' || !isValidClassicAddress(value)) throw new Error('Indirizzo XRPL non valido.')
  return value
}

function utc(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Istante UTC richiesto.')
  rippleTime(value)
  return value
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('Intero fuori intervallo.')
  }
  return value
}

export function digestTerms(terms: Parameters<typeof canonicalJson>[0]): string {
  return createHash('sha256').update(canonicalJson(terms), 'utf8').digest('hex')
}

export function readTitle(value: unknown): TitleTerms {
  const title = shape(value, ['resourceId', 'issuer', 'alice', 'validFrom', 'validTo'])
  const result = {
    resourceId: id(title.resourceId), issuer: address(title.issuer), alice: address(title.alice),
    validFrom: utc(title.validFrom), validTo: utc(title.validTo),
  }
  if (result.issuer === result.alice || result.validFrom >= result.validTo) throw new Error('Termini del titolo non validi.')
  return result
}

function splitPrice(price: unknown, bps: number) {
  if (typeof price !== 'string' || !/^[1-9]\d{0,17}$/.test(price) || BigInt(price) > 100_000_000_000_000_000n) {
    throw new Error('Prezzo in drops non valido.')
  }
  const total = BigInt(price)
  const fee = total * BigInt(bps) / 10_000n
  const net = total - fee
  if (fee < 1n || net < 1n) throw new Error('Fee e netto devono valere almeno un drop.')
  return { priceDrops: price, feeDrops: fee.toString(), netDrops: net.toString() }
}

export function readProposal(input: unknown) {
  const value = shape(input, [
    'protocol', 'version', 'network', 'listingId', 'revision', 'resourceId', 'titleNftId',
    'issuer', 'alice', 'startsAt', 'endsAt', 'priceDrops', 'feeBps', 'splitRule',
  ])
  if (value.protocol !== proposalProtocol || value.version !== version || value.network !== network || value.splitRule !== splitRule) {
    throw new Error('Protocollo, rete o regola di riparto della proposta non supportati.')
  }
  const feeBps = integer(value.feeBps, 1, 9999)
  const { priceDrops } = splitPrice(value.priceDrops, feeBps)
  const proposal = {
    protocol: proposalProtocol, version, network, splitRule,
    listingId: id(value.listingId), revision: integer(value.revision, 1, Number.MAX_SAFE_INTEGER),
    resourceId: id(value.resourceId), titleNftId: readHash(value.titleNftId),
    issuer: address(value.issuer), alice: address(value.alice),
    startsAt: utc(value.startsAt), endsAt: utc(value.endsAt), priceDrops, feeBps,
  }
  if (proposal.startsAt >= proposal.endsAt || proposal.alice === proposal.issuer) {
    throw new Error('Intervallo o soggetti dell’affitto non validi.')
  }
  return proposal
}

export function readOrder(input: unknown) {
  const value = shape(input, ['protocol', 'version', 'network', 'orderId', 'proposalHash', 'bob', 'vault', 'fundBy'])
  if (value.protocol !== orderProtocol || value.version !== version || value.network !== network) {
    throw new Error('Protocollo o rete dell’ordine non supportati.')
  }
  return {
    protocol: orderProtocol, version, network, orderId: id(value.orderId),
    proposalHash: readHash(value.proposalHash).toLowerCase(),
    bob: address(value.bob), vault: address(value.vault), fundBy: utc(value.fundBy),
  }
}

export type RentalProposal = ReturnType<typeof readProposal>
export type RentalOrder = ReturnType<typeof readOrder>
export type SignedProposal = { proposal: RentalProposal; proof: WalletSignature }
export type SignedOrder = { order: RentalOrder; proof: WalletSignature }
export type RentalBundle = SignedProposal & { acceptance: SignedOrder }

function authenticateProposal(proposal: RentalProposal, proof: unknown) {
  if (verifyWalletSignature('rental-proposal', proposal, proof) !== proposal.alice) {
    throw new Error('Firma di Alice non corrispondente all’indirizzo della proposta.')
  }
}

function checkOrder(proposal: RentalProposal, order: RentalOrder) {
  if (order.proposalHash !== digestTerms(proposal) || order.fundBy > proposal.startsAt
    || new Set([proposal.alice, proposal.issuer, order.bob, order.vault]).size !== 4) {
    throw new Error('Ordine incompatibile con la proposta firmata.')
  }
}

export function signProposal(input: unknown, signer: LocalSigner): SignedProposal {
  const proposal = readProposal(input)
  if (signer.classicAddress !== proposal.alice) throw new Error('La proposta deve essere firmata da Alice.')
  return { proposal, proof: signer.signMessage('rental-proposal', proposal) }
}

export function signOrder(signed: SignedProposal, input: unknown, signer: LocalSigner): SignedOrder {
  const proposal = readProposal(signed.proposal)
  authenticateProposal(proposal, signed.proof)
  const order = readOrder(input)
  checkOrder(proposal, order)
  if (signer.classicAddress !== order.bob) throw new Error('L’ordine deve essere firmato da Bob.')
  return { order, proof: signer.signMessage('rental-order', order) }
}

/** resource comes from the backend catalog, including the configured vault. */
export function verifyRental(bundle: RentalBundle, resource: RentalResource) {
  const proposal = readProposal(bundle.proposal)
  const order = readOrder(bundle.acceptance.order)
  authenticateProposal(proposal, bundle.proof)
  checkOrder(proposal, order)
  if (verifyWalletSignature('rental-order', order, bundle.acceptance.proof) !== order.bob) {
    throw new Error('Firma di Bob non corrispondente all’indirizzo dell’ordine.')
  }
  const { titleNftId, vault, ...titleInput } = resource
  const title = readTitle(titleInput)
  if (title.resourceId !== proposal.resourceId || title.issuer !== proposal.issuer
    || title.alice !== proposal.alice || readHash(titleNftId) !== proposal.titleNftId
    || vault !== order.vault || proposal.startsAt < title.validFrom || proposal.endsAt > title.validTo) {
    throw new Error('Termini incompatibili con il titolo o il vault registrato.')
  }

  const { feeDrops, netDrops } = splitPrice(proposal.priceDrops, proposal.feeBps)
  return { proposal, order, title, agreementHash: digestTerms(order), feeDrops, netDrops }
}
