import {
  isValidClassicAddress,
  type AccountSet,
  type EscrowCreate,
  type EscrowFinish,
  type Memo,
  type Payment,
  type SignerEntry,
  type SignerListSet,
} from 'xrpl'
import type {
  RentalAmountSplit,
  RentalPaymentOrder,
  VaultResolutionMode,
} from '../shared/escrow-order.js'

export const RIPPLE_EPOCH_SECONDS = 946_684_800
export const MAX_XRPL_DROPS = 100_000_000_000_000_000n
export const AMENDMENTS_LEDGER_ENTRY_ID =
  '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4'
export const FEE_SETTINGS_LEDGER_ENTRY_ID =
  '4BC50C9B0D8515D3EAAE1E74B29A95804346C491EE1A95BF25E4AAB854A6A651'
export const NFTOKEN_MINT_OFFER_AMENDMENT_ID =
  'EE3CF852F0506782D05E65D49E5DCC3D16D50898CD1B646BAE274863401CC3CE'

export const ASF_DISABLE_MASTER = 4
export const LSF_DISABLE_MASTER = 0x0010_0000
export const TF_PARTIAL_PAYMENT = 0x0002_0000

export const MEMO_TYPE_VAULT_PAYOUT = 'affitti:v2:vault-payout'
export const MEMO_TYPE_FEE_REFUND = 'affitti:v2:fee-refund'

export function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
}

export function normalizeHash(value: string, label = 'XRPL hash'): string {
  if (!isHash(value)) throw new Error(`Invalid ${label}`)
  return value.toUpperCase()
}

export function parsePositiveDrops(value: string | bigint, label = 'Amount in drops'): bigint {
  if (typeof value === 'bigint') {
    if (value < 1n || value > MAX_XRPL_DROPS) {
      throw new Error(`${label} out of XRPL range`)
    }
    return value
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,17}$/.test(value)) {
    throw new Error(`${label} must be a positive integer in drops`)
  }
  const parsed = BigInt(value)
  if (parsed < 1n || parsed > MAX_XRPL_DROPS) {
    throw new Error(`${label} out of XRPL range`)
  }
  return parsed
}

/**
 * Computes the v2 commercial split using integer arithmetic:
 * feeDrops = floor(grossDrops * feeBps / 10000)
 * netDrops = grossDrops - feeDrops
 * Requires at least 1 drop for both fee and net.
 */
export function splitRentalAmount(
  grossDrops: string | bigint,
  feeBps: number,
): RentalAmountSplit {
  const gross = parsePositiveDrops(grossDrops, 'Gross price')
  if (!Number.isInteger(feeBps) || feeBps < 1 || feeBps >= 10_000) {
    throw new Error('feeBps must be an integer between 1 and 9999')
  }
  const fee = (gross * BigInt(feeBps)) / 10_000n
  const net = gross - fee
  if (fee < 1n || net < 1n) {
    throw new Error('Fee and net must each be at least 1 drop')
  }
  return {
    grossDrops: gross.toString(),
    feeBps,
    feeDrops: fee.toString(),
    netDrops: net.toString(),
  }
}

export function isRippleTime(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffff_ffff
}

export function toRippleTime(value: string, label = 'UTC timestamp'): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(value)) {
    throw new Error(`${label} must be UTC ISO 8601 at second precision`)
  }
  const unixMillis = Date.parse(value)
  if (!Number.isFinite(unixMillis)) {
    throw new Error(`Invalid ${label}`)
  }
  const canonical = new Date(unixMillis).toISOString()
  if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) {
    throw new Error(`Invalid UTC calendar ${label}`)
  }
  const rippleSeconds = unixMillis / 1000 - RIPPLE_EPOCH_SECONDS
  if (!isRippleTime(rippleSeconds)) {
    throw new Error(`${label} out of XRPL time range`)
  }
  return rippleSeconds
}

export interface ParsedOrderSchedule {
  readonly checkoutBy: number
  readonly startAt: number
  readonly finishAfter: number
}

export function validateRentalOrder(order: RentalPaymentOrder): ParsedOrderSchedule {
  if (order.network !== 'testnet') {
    throw new Error('Unsupported order network: testnet required')
  }
  if (order.scenario !== 'cad' && order.scenario !== 'billboard') {
    throw new Error('Invalid vault scenario: cad or billboard required')
  }
  if (typeof order.orderId !== 'string' || !order.orderId.trim() || order.orderId !== order.orderId.trim()) {
    throw new Error('Invalid orderId')
  }
  if (!isHash(order.agreementHash)) {
    throw new Error('agreementHash must be a 64-character hex SHA-256')
  }
  const addresses = [order.alice, order.bob, order.authority, order.vault]
  if (!addresses.every((addr) => typeof addr === 'string' && isValidClassicAddress(addr))) {
    throw new Error('Invalid classic XRPL addresses in order')
  }
  if (new Set(addresses).size !== 4) {
    throw new Error('Alice, Bob, authority, and vault must have four distinct addresses')
  }

  const expectedSplit = splitRentalAmount(order.grossDrops, order.feeBps)
  if (order.feeDrops !== expectedSplit.feeDrops || order.netDrops !== expectedSplit.netDrops) {
    throw new Error('feeDrops/netDrops split does not match grossDrops and feeBps')
  }

  const checkoutBy = toRippleTime(order.checkoutDeadline, 'checkoutDeadline')
  const startAt = toRippleTime(order.startAt, 'startAt')
  const finishAfter = toRippleTime(order.endAt, 'endAt')
  if (checkoutBy > startAt || startAt >= finishAfter) {
    throw new Error('Inconsistent deadlines: required checkoutDeadline <= startAt < endAt')
  }

  return { checkoutBy, startAt, finishAfter }
}

/**
 * Builds the v2 time-locked EscrowCreate for the net amount:
 * destination is the scenario vault, FinishAfter = endAt, no Condition and no CancelAfter.
 */
export function buildEscrowCreate(order: RentalPaymentOrder): EscrowCreate {
  const { finishAfter } = validateRentalOrder(order)
  return {
    TransactionType: 'EscrowCreate',
    Account: order.bob,
    Destination: order.vault,
    Amount: order.netDrops,
    FinishAfter: finishAfter,
  }
}

export function buildEscrowFinish(
  order: RentalPaymentOrder,
  deposit: { readonly owner: string; readonly sequence: number },
  senderAddress: string,
): EscrowFinish {
  validateRentalOrder(order)
  if (deposit.owner !== order.bob) {
    throw new Error('Deposit owner differs from Bob in order')
  }
  if (!Number.isInteger(deposit.sequence) || deposit.sequence < 1) {
    throw new Error('Invalid escrow OfferSequence')
  }
  if (!isValidClassicAddress(senderAddress)) {
    throw new Error('Invalid operator account address for EscrowFinish')
  }
  return {
    TransactionType: 'EscrowFinish',
    Account: senderAddress,
    Owner: deposit.owner,
    OfferSequence: deposit.sequence,
  }
}

export interface VaultSettlementRule {
  readonly beneficiary: string
  readonly allowedSigners: readonly string[]
}

export function resolveVaultSettlement(
  order: RentalPaymentOrder,
  mode: VaultResolutionMode,
): VaultSettlementRule {
  validateRentalOrder(order)
  switch (mode) {
    case 'ordinary':
      return {
        beneficiary: order.alice,
        allowedSigners: [order.alice, order.bob, order.authority],
      }
    case 'arbitration_alice':
      return {
        beneficiary: order.alice,
        allowedSigners: [order.authority, order.alice],
      }
    case 'arbitration_bob':
      return {
        beneficiary: order.bob,
        allowedSigners: [order.authority, order.bob],
      }
    case 'inadmissible_refund':
      return {
        beneficiary: order.bob,
        allowedSigners: [order.alice, order.bob, order.authority],
      }
  }
}

export function encodeOrderMemo(
  memoType: string,
  orderId: string,
  agreementHash: string,
): Memo {
  const payload = `${orderId}:${agreementHash.toLowerCase()}`
  return {
    Memo: {
      MemoType: Buffer.from(memoType, 'utf8').toString('hex').toUpperCase(),
      MemoData: Buffer.from(payload, 'utf8').toString('hex').toUpperCase(),
    },
  }
}

export function matchesOrderMemo(
  memos: readonly Memo[] | undefined,
  memoType: string,
  orderId: string,
  agreementHash: string,
): boolean {
  if (!memos || memos.length !== 1) return false
  const expected = encodeOrderMemo(memoType, orderId, agreementHash)
  const actual = memos[0]?.Memo
  if (!actual) return false
  return (
    actual.MemoType?.toUpperCase() === expected.Memo.MemoType &&
    actual.MemoData?.toUpperCase() === expected.Memo.MemoData &&
    actual.MemoFormat === undefined
  )
}

export function buildVaultPayout(
  order: RentalPaymentOrder,
  mode: VaultResolutionMode,
): Payment {
  const { beneficiary } = resolveVaultSettlement(order, mode)
  return {
    TransactionType: 'Payment',
    Account: order.vault,
    Destination: beneficiary,
    Amount: order.netDrops,
    SigningPubKey: '',
    Memos: [encodeOrderMemo(MEMO_TYPE_VAULT_PAYOUT, order.orderId, order.agreementHash)],
  }
}

export function buildFeeRefund(order: RentalPaymentOrder): Payment {
  validateRentalOrder(order)
  return {
    TransactionType: 'Payment',
    Account: order.authority,
    Destination: order.bob,
    Amount: order.feeDrops,
    Memos: [encodeOrderMemo(MEMO_TYPE_FEE_REFUND, order.orderId, order.agreementHash)],
  }
}

export function canonicalSignerAddresses(
  signers: readonly [string, string, string],
): [string, string, string] {
  if (signers.length !== 3 || !signers.every((addr) => isValidClassicAddress(addr))) {
    throw new Error('Exactly 3 valid classic addresses required for the vault')
  }
  if (new Set(signers).size !== 3) {
    throw new Error('The three vault signers must have distinct addresses')
  }
  const sorted = [...signers].sort()
  return [sorted[0]!, sorted[1]!, sorted[2]!]
}

export function buildVaultSignerListSet(
  vaultAddress: string,
  signers: readonly [string, string, string],
): SignerListSet {
  if (!isValidClassicAddress(vaultAddress)) {
    throw new Error('Invalid vault address')
  }
  const ordered = canonicalSignerAddresses(signers)
  if (ordered.includes(vaultAddress)) {
    throw new Error('Vault cannot be a signer of itself')
  }
  const entries: SignerEntry[] = ordered.map((account) => ({
    SignerEntry: {
      Account: account,
      SignerWeight: 1,
    },
  }))
  return {
    TransactionType: 'SignerListSet',
    Account: vaultAddress,
    SignerQuorum: 2,
    SignerEntries: entries,
  }
}

export function buildVaultDisableMaster(vaultAddress: string): AccountSet {
  if (!isValidClassicAddress(vaultAddress)) {
    throw new Error('Invalid vault address')
  }
  return {
    TransactionType: 'AccountSet',
    Account: vaultAddress,
    SetFlag: ASF_DISABLE_MASTER,
  }
}
