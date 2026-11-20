import { createHash, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'
import { toUSVString } from 'node:util'
import { canonicalJson } from './json.js'

export const PROTOCOL = 'xrpl-unito-agreement'
export const VERSION = 1
export const NETWORK = 'testnet'

export type SignerRole = 'alice' | 'bob'
type Party = { address: string }
type Regulation = { version: number; sha256: string }
type Deadlines = {
  offerExpiresAt: string
  fundBy: string
  startBy: string
  deliverBy: string
  finishAfter: string
  cancelAfter: string
}

export type Agreement = {
  protocol: typeof PROTOCOL
  version: typeof VERSION
  network: typeof NETWORK
  orderId: string
  parties: { alice: Party; bob: Party; oracle: Party }
  nftId: string
  offerId: string
  filter: { id: string; version: number }
  input: { id: string; sha256: string }
  priceDrops: 1000000
  condition: string
  deadlines: Deadlines
  retentionSeconds: number
  regulation: Regulation
}

export type AgreementTrust = {
  orderId: string
  network: typeof NETWORK
  parties: {
    alice: Party & { publicKeyPem: string }
    bob: Party & { publicKeyPem: string }
    oracle: Party
  }
  regulation: Regulation
}

export type AgreementSignature = { role: SignerRole; agreementHash: string; signature: string }
type AgreementContent = { agreement: Agreement; regulationText: string; agreementHash: string }
export type AgreementBundle = AgreementContent & { signatures: Record<SignerRole, string> }

function object(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object') throw new Error(`${field}: oggetto richiesto`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${field}: oggetto JSON richiesto`)
  const members = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(members).length !== keys.length || !keys.every((key) => {
    const member = members[key]
    return Object.hasOwn(members, key) && member?.enumerable && Object.hasOwn(member, 'value')
  })) {
    throw new Error(`${field}: proprietà attese ${keys.join(', ')}`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || toUSVString(value) !== value) {
    throw new Error(`${field}: testo Unicode non valido`)
  }
  return value
}

function matchingText(value: unknown, field: string, pattern: RegExp): string {
  const result = text(value, field)
  if (!pattern.test(result)) throw new Error(`${field}: formato non valido`)
  return result
}

function identifier(value: unknown, field: string): string {
  const id = text(value, field)
  if (!id || id !== id.trim() || /[\p{Cc}\p{Bidi_Control}]/u.test(id)) {
    throw new Error(`${field}: identificativo non valido`)
  }
  return id
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field}: intero positivo richiesto`)
  }
  return value
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function digest(value: unknown, field: string): string {
  return matchingText(value, field, /^[0-9a-f]{64}$/)
}

const BASE58 = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'

function classicAddress(value: unknown, field: string): string {
  const address = matchingText(value, field, /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/)
  let decoded = 0n
  for (const character of address) decoded = decoded * 58n + BigInt(BASE58.indexOf(character))
  const leadingZeros = address.match(/^r+/)![0].length
  const hex = decoded === 0n ? '' : decoded.toString(16)
  const bytes = Buffer.from('00'.repeat(leadingZeros) + hex.padStart(hex.length + hex.length % 2, '0'), 'hex')
  const checksum = sha256(Buffer.from(sha256(bytes.subarray(0, 21)), 'hex')).slice(0, 8)
  if (bytes.length !== 25 || bytes.subarray(21).toString('hex') !== checksum) {
    throw new Error(`${field}: checksum dell’indirizzo XRPL non valido`)
  }
  return address
}

function readParty(value: unknown, field: string): Party {
  const party = object(value, field, ['address'])
  return { address: classicAddress(party.address, `${field}.address`) }
}

function publicKey(value: unknown, field: string): KeyObject {
  const pem = matchingText(value, field, /^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----(?:\r?\n)?$/)
  let key: KeyObject
  try {
    key = createPublicKey(pem)
  } catch {
    throw new Error(`${field}: chiave pubblica SPKI non valida`)
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${field}: chiave Ed25519 richiesta`)
  return key
}

function readRegulation(value: unknown, field: string): Regulation {
  const regulation = object(value, field, ['version', 'sha256'])
  return {
    version: positiveInteger(regulation.version, `${field}.version`),
    sha256: digest(regulation.sha256, `${field}.sha256`),
  }
}

function readTrustedSigner(value: unknown, role: SignerRole) {
  const field = `config.parties.${role}`
  const party = object(value, field, ['address', 'publicKeyPem'])
  return {
    address: classicAddress(party.address, `${field}.address`),
    publicKey: publicKey(party.publicKeyPem, `${field}.publicKeyPem`),
  }
}

function readTrust(value: unknown) {
  const config = object(value, 'config', ['orderId', 'network', 'parties', 'regulation'])
  if (config.network !== NETWORK) throw new Error('config.network: è richiesta Testnet')
  const parties = object(config.parties, 'config.parties', ['alice', 'bob', 'oracle'])
  const alice = readTrustedSigner(parties.alice, 'alice')
  const bob = readTrustedSigner(parties.bob, 'bob')
  const oracle = readParty(parties.oracle, 'config.parties.oracle')
  if (alice.publicKey.equals(bob.publicKey)) throw new Error('Alice e Bob devono avere chiavi applicative distinte')
  if (new Set([alice.address, bob.address, oracle.address]).size !== 3) {
    throw new Error('Alice, Bob e oracolo devono avere indirizzi distinti')
  }
  return {
    orderId: identifier(config.orderId, 'config.orderId'),
    parties: { alice, bob, oracle },
    regulation: readRegulation(config.regulation, 'config.regulation'),
  }
}

function rippleTime(value: string, field: string): number {
  const date = new Date(value)
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)
    || !Number.isFinite(date.getTime()) || date.toISOString().replace('.000Z', 'Z') !== value) {
    throw new Error(`${field}: data UTC ISO al secondo non valida`)
  }
  const seconds = date.getTime() / 1000 - 946684800
  if (seconds < 1 || seconds > 0xFFFFFFFF) throw new Error(`${field}: data fuori intervallo XRPL`)
  return seconds
}

export function toRippleTime(value: string): number {
  return rippleTime(value, 'data')
}

const DEADLINE_FIELDS = ['offerExpiresAt', 'fundBy', 'startBy', 'deliverBy', 'finishAfter', 'cancelAfter'] as const

function readDeadlines(value: unknown): Deadlines {
  const fields = object(value, 'deadlines', DEADLINE_FIELDS)
  const dates = Object.fromEntries(DEADLINE_FIELDS.map((key) => {
    const field = `deadlines.${key}`
    const date = text(fields[key], field)
    rippleTime(date, field)
    return [key, date]
  })) as Deadlines
  const { offerExpiresAt, fundBy, startBy, deliverBy, finishAfter, cancelAfter } = dates
  if (!(offerExpiresAt < fundBy && fundBy < startBy && startBy < deliverBy
    && deliverBy === finishAfter && finishAfter < cancelAfter)) {
    throw new Error('deadlines: ordine delle scadenze o finestra escrow non valida')
  }
  return dates
}

function readAgreement(value: unknown): Agreement {
  const agreement = object(value, 'agreement', [
    'protocol', 'version', 'network', 'orderId', 'parties', 'nftId', 'offerId', 'filter', 'input',
    'priceDrops', 'condition', 'deadlines', 'retentionSeconds', 'regulation',
  ])
  if (agreement.protocol !== PROTOCOL || agreement.version !== VERSION || agreement.network !== NETWORK) {
    throw new Error('agreement: protocollo, versione o rete non supportati')
  }
  if (agreement.priceDrops !== 1000000) throw new Error('priceDrops: sono richiesti 1000000 drops')
  const parties = object(agreement.parties, 'parties', ['alice', 'bob', 'oracle'])
  const filter = object(agreement.filter, 'filter', ['id', 'version'])
  const input = object(agreement.input, 'input', ['id', 'sha256'])
  const ledgerId = /^(?!0{64})[0-9a-f]{64}$/i
  return {
    protocol: PROTOCOL,
    version: VERSION,
    network: NETWORK,
    orderId: identifier(agreement.orderId, 'orderId'),
    parties: {
      alice: readParty(parties.alice, 'parties.alice'),
      bob: readParty(parties.bob, 'parties.bob'),
      oracle: readParty(parties.oracle, 'parties.oracle'),
    },
    nftId: matchingText(agreement.nftId, 'nftId', ledgerId),
    offerId: matchingText(agreement.offerId, 'offerId', ledgerId),
    filter: { id: identifier(filter.id, 'filter.id'), version: positiveInteger(filter.version, 'filter.version') },
    input: { id: identifier(input.id, 'input.id'), sha256: digest(input.sha256, 'input.sha256') },
    priceDrops: 1000000,
    // DER PREIMAGE-SHA-256 con fingerprint di 32 byte e costo 32 (preimage dell'oracolo).
    condition: matchingText(agreement.condition, 'condition', /^A0258020[0-9a-f]{64}810120$/i),
    deadlines: readDeadlines(agreement.deadlines),
    retentionSeconds: positiveInteger(agreement.retentionSeconds, 'retentionSeconds'),
    regulation: readRegulation(agreement.regulation, 'regulation'),
  }
}

function prepare(value: unknown, regulation: unknown, expected: unknown) {
  const agreement = readAgreement(value)
  const trust = readTrust(expected)
  if (agreement.orderId !== trust.orderId) throw new Error('orderId: ordine inatteso')
  for (const role of ['alice', 'bob', 'oracle'] as const) {
    if (agreement.parties[role].address !== trust.parties[role].address) {
      throw new Error(`parties.${role}.address: indirizzo inatteso`)
    }
  }
  const regulationText = text(regulation, 'regulationText')
  const regulationHash = sha256(regulationText)
  if (agreement.regulation.version !== trust.regulation.version
    || agreement.regulation.sha256 !== trust.regulation.sha256
    || regulationHash !== trust.regulation.sha256) {
    throw new Error('regolamento: versione o SHA-256 inatteso')
  }
  const canonicalBytes = Buffer.from(canonicalJson(agreement), 'utf8')
  const content: AgreementContent = { agreement, regulationText, agreementHash: sha256(canonicalBytes) }
  return { content, canonicalBytes, trust }
}

export function prepareAgreement(agreement: unknown, regulationText: unknown, expected: unknown): AgreementContent {
  return prepare(agreement, regulationText, expected).content
}

function signerRole(role: unknown): SignerRole {
  if (role !== 'alice' && role !== 'bob') throw new Error('Ruolo di firma richiesto: alice o bob')
  return role
}

export function signAgreement(
  agreement: unknown, regulationText: unknown, expected: unknown, role: SignerRole, privateKey: KeyObject,
): AgreementSignature {
  const { content, canonicalBytes, trust } = prepare(agreement, regulationText, expected)
  const signer = signerRole(role)
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519'
    || !createPublicKey(privateKey).equals(trust.parties[signer].publicKey)) {
    throw new Error(`Chiave privata Ed25519 inattesa per ${signer}`)
  }
  const signature = sign(null, canonicalBytes, privateKey).toString('base64')
  return { role: signer, agreementHash: content.agreementHash, signature }
}

function checkHash(value: unknown, expected: string) {
  if (digest(value, 'agreementHash') !== expected) throw new Error('agreementHash: hash dell’accordo diverso')
}

function checkSignature(value: unknown, role: SignerRole, bytes: Buffer, key: KeyObject): string {
  const signature = matchingText(value, `firma ${role}`, /^[A-Za-z0-9+/]{86}==$/)
  const decoded = Buffer.from(signature, 'base64')
  if (decoded.toString('base64') !== signature || !verify(null, bytes, key, decoded)) {
    throw new Error(`Firma ${role} non valida`)
  }
  return signature
}

function checkDetachedSignature(value: unknown, prepared: ReturnType<typeof prepare>): AgreementSignature {
  const detached = object(value, 'firma', ['role', 'agreementHash', 'signature'])
  const role = signerRole(detached.role)
  const { content, canonicalBytes, trust } = prepared
  checkHash(detached.agreementHash, content.agreementHash)
  const signature = checkSignature(detached.signature, role, canonicalBytes, trust.parties[role].publicKey)
  return { role, agreementHash: content.agreementHash, signature }
}

export function verifyAgreementSignature(
  agreement: unknown, regulationText: unknown, signature: unknown, expected: unknown,
): AgreementSignature {
  return checkDetachedSignature(signature, prepare(agreement, regulationText, expected))
}

export function assembleAgreement(
  agreement: unknown, regulationText: unknown, first: unknown, second: unknown, expected: unknown,
): AgreementBundle {
  const prepared = prepare(agreement, regulationText, expected)
  const a = checkDetachedSignature(first, prepared)
  const b = checkDetachedSignature(second, prepared)
  if (a.role === b.role) throw new Error('Sono richieste una firma di Alice e una di Bob')
  const [alice, bob] = a.role === 'alice' ? [a, b] : [b, a]
  return { ...prepared.content, signatures: { alice: alice.signature, bob: bob.signature } }
}

export function verifyAgreement(value: unknown, expected: unknown): AgreementBundle {
  const bundle = object(value, 'fascicolo', ['agreement', 'regulationText', 'agreementHash', 'signatures'])
  const { content, canonicalBytes, trust } = prepare(bundle.agreement, bundle.regulationText, expected)
  checkHash(bundle.agreementHash, content.agreementHash)
  const signatures = object(bundle.signatures, 'signatures', ['alice', 'bob'])
  return {
    ...content,
    signatures: {
      alice: checkSignature(signatures.alice, 'alice', canonicalBytes, trust.parties.alice.publicKey),
      bob: checkSignature(signatures.bob, 'bob', canonicalBytes, trust.parties.bob.publicKey),
    },
  }
}
