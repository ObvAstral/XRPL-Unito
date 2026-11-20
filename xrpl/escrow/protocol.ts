import { createHash, randomBytes } from 'node:crypto'
import { isValidClassicAddress, type EscrowCreate } from 'xrpl'
import type { EscrowOrder } from '../shared/escrow-order.js'

export const RIPPLE_EPOCH_SECONDS = 946_684_800
export const AMOUNT_DROPS = '1000000'
export const CANCEL_DELAY_SECONDS = 300
export const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)

function isRippleTime(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffff_ffff
}

function parseDeadline(value: string): number {
  const unixMillis = Date.parse(value)
  if (!Number.isFinite(unixMillis)
    || (value !== new Date(unixMillis).toISOString()
      && value !== new Date(unixMillis).toISOString().replace('.000Z', 'Z'))) {
    throw new Error('Scadenza attesa in UTC ISO 8601')
  }
  const ripple = unixMillis / 1000 - RIPPLE_EPOCH_SECONDS
  if (!isRippleTime(ripple)) throw new Error('Scadenza fuori intervallo o frazionaria')
  return ripple
}

function conditionFor(preimage: Uint8Array): string {
  if (preimage.length !== 32) throw new Error('Preimage attesa di 32 byte')
  const fingerprint = createHash('sha256').update(preimage).digest('hex').toUpperCase()
  // DER PREIMAGE-SHA-256: [0] fingerprint di 32 byte, [1] cost di 32.
  return 'A0258020' + fingerprint + '810120'
}

export function prepareCondition(): { condition: string; preimage: Buffer } {
  const preimage = randomBytes(32)
  return { condition: conditionFor(preimage), preimage }
}

export function encodeFulfillment(preimage: Uint8Array, condition: string): string {
  if (conditionFor(preimage) !== condition.toUpperCase()) {
    throw new Error('Preimage incompatibile con la condizione dell’ordine')
  }
  // DER PREIMAGE-SHA-256 fulfillment: [0] preimage di 32 byte.
  return 'A0228020' + Buffer.from(preimage).toString('hex').toUpperCase()
}

export function escrowTimes(order: EscrowOrder) {
  const fundBy = parseDeadline(order.fundBy)
  const finishAfter = parseDeadline(order.deliverBy)
  const cancelAfter = finishAfter + CANCEL_DELAY_SECONDS
  if (fundBy >= finishAfter || !isRippleTime(cancelAfter)) {
    throw new Error('Scadenze escrow incoerenti')
  }
  return { fundBy, finishAfter, cancelAfter }
}

export function escrowCreate(order: EscrowOrder): EscrowCreate {
  if (order.network !== 'testnet' || !order.orderId || !isHash(order.agreementHash)
    || ![order.bob, order.alice, order.oracle].every(isValidClassicAddress)
    || new Set([order.bob, order.alice, order.oracle]).size !== 3
    || order.amountDrops !== AMOUNT_DROPS || !/^A0258020[0-9A-F]{64}810120$/i.test(order.condition)) {
    throw new Error('Termini escrow incompatibili con il protocollo Testnet')
  }
  const { finishAfter, cancelAfter } = escrowTimes(order)
  return {
    TransactionType: 'EscrowCreate',
    Account: order.bob,
    Destination: order.alice,
    Amount: order.amountDrops,
    Condition: order.condition.toUpperCase(),
    FinishAfter: finishAfter,
    CancelAfter: cancelAfter,
  }
}
