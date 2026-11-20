import type { EscrowOrder } from '../shared/escrow-order.js'
import type { VerifyRegisteredAgreement } from '../escrow/index.js'
import { escrowTimes } from '../escrow/protocol.js'
import { toRippleTime, verifyAgreement, type AgreementTrust } from './agreement.js'

export function verifyEscrowOrder(bundle: unknown, expected: AgreementTrust): EscrowOrder {
  const { agreement, agreementHash } = verifyAgreement(bundle, expected)
  const { parties, deadlines } = agreement
  const order: EscrowOrder = {
    orderId: agreement.orderId,
    agreementHash,
    network: agreement.network,
    alice: parties.alice.address,
    bob: parties.bob.address,
    oracle: parties.oracle.address,
    amountDrops: String(agreement.priceDrops),
    condition: agreement.condition,
    fundBy: deadlines.fundBy,
    deliverBy: deadlines.deliverBy,
  }
  const { finishAfter, cancelAfter } = escrowTimes(order)
  if (finishAfter !== toRippleTime(deadlines.finishAfter) || cancelAfter !== toRippleTime(deadlines.cancelAfter)) {
    throw new Error('Le scadenze firmate non corrispondono a quelle della transazione escrow.')
  }
  return order
}

type LoadRegistration = (orderId: string, oracleAddress: string) => Promise<{
  orderId: string
  agreementHash: string
} | undefined>

/** Read the registration from the authenticated oracle for this order. */
export function createEscrowAgreementVerifier(
  expected: AgreementTrust,
  loadRegistration: LoadRegistration,
): VerifyRegisteredAgreement<unknown> {
  return async (bundle) => {
    const order = verifyEscrowOrder(bundle, expected)
    const registration = await loadRegistration(order.orderId, order.oracle)
    if (registration?.orderId !== order.orderId || registration.agreementHash !== order.agreementHash) {
      throw new Error('AGREEMENT_NOT_READY')
    }
    return { order, registeredAgreementHash: registration.agreementHash }
  }
}
