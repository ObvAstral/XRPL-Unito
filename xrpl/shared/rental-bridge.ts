import { verifyRental } from '../agreement/rental.js'
import type { LocalSigner } from '../agreement/wallet.js'
import {
  EscrowLedger,
  type OrderEscrowStatus,
  type ValidatedLedger,
} from '../escrow/ledger.js'
import type { RentalPaymentOrder, VaultScenario } from './escrow-order.js'
import type { ConfirmPrompt, RoleSigner } from './signer.js'

export type VerifiedRental = ReturnType<typeof verifyRental>

export interface PassLedgerRefs {
  readonly passNftId?: string
  readonly offerId?: string
  readonly acceptOfferHash?: string
  readonly createHash?: string
}

/**
 * Translates the agreement verified by Person A into Person B's payment order.
 * `agreementHash` is the digest of the signed order (the same as in the pass URI).
 * `scenario` is not inside the agreement: the backend selects it together with the vault.
 */
export function toPaymentOrder(
  rental: VerifiedRental,
  scenario: VaultScenario,
  refs: PassLedgerRefs = {},
): RentalPaymentOrder {
  return {
    orderId: rental.order.orderId,
    agreementHash: rental.agreementHash,
    scenario,
    network: 'testnet',
    alice: rental.proposal.alice,
    bob: rental.order.bob,
    authority: rental.proposal.issuer,
    vault: rental.order.vault,
    grossDrops: rental.proposal.priceDrops,
    feeBps: rental.proposal.feeBps,
    feeDrops: rental.feeDrops,
    netDrops: rental.netDrops,
    checkoutDeadline: rental.order.fundBy,
    startAt: rental.proposal.startsAt,
    endAt: rental.proposal.endsAt,
    ...(refs.passNftId !== undefined ? { passNftId: refs.passNftId } : {}),
    ...(refs.offerId !== undefined ? { offerId: refs.offerId } : {}),
    ...(refs.acceptOfferHash !== undefined ? { acceptOfferHash: refs.acceptOfferHash } : {}),
    ...(refs.createHash !== undefined ? { createHash: refs.createHash } : {}),
  }
}

/** Adapts Person A's LocalSigner to the RoleSigner interface invoked by escrow. */
export function adaptLocalSigner(
  signer: LocalSigner,
  confirm: ConfirmPrompt = async () => true,
): RoleSigner {
  return {
    address: signer.classicAddress,
    async signSingle(tx, context) {
      if (tx.Account !== signer.classicAddress) {
        throw new Error(`Signer ${signer.classicAddress} differs from Account ${tx.Account}`)
      }
      if (!(await confirm(context))) throw new Error('Signature rejected by user')
      const { hash, tx_blob } = signer.sign(tx)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: signer.classicAddress }
    },
    async signForMultisig(tx, context) {
      if (tx.SigningPubKey !== '') {
        throw new Error('Multisig transaction must have empty SigningPubKey')
      }
      if (!(await confirm(context))) throw new Error('Partial signature rejected by user')
      const { hash, tx_blob } = signer.signPartial(tx)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: signer.classicAddress }
    },
  }
}

/**
 * Revocation vocabulary (A): only `missing` authorizes the burn.
 * `mismatch` remains `present`: an object exists that does not match the terms, do not burn.
 */
export function escrowStateForRevoke(
  state: OrderEscrowStatus['state'],
): 'missing' | 'present' | 'pending' {
  if (state === 'missing') return 'missing'
  if (state === 'pending') return 'pending'
  return 'present'
}

/**
 * Deposit state to pass to `RentalNfts.revokePass` on the same snapshot used for the pass.
 * Without `createHash`, looks for an active Escrow from Bob. `attemptsPending` blocks burning
 * until AttemptStore has reconciled the submission.
 */
export async function rentalDepositState(
  ledger: EscrowLedger,
  order: RentalPaymentOrder,
  snapshot: ValidatedLedger,
  attemptsPending = false,
): Promise<'missing' | 'present' | 'pending'> {
  if (attemptsPending) return 'pending'
  if (order.createHash !== undefined) {
    const status = await ledger.verifyEscrowAt(
      { ...order, createHash: order.createHash },
      snapshot,
    )
    return escrowStateForRevoke(status.state)
  }
  if (await ledger.hasMatchingActiveEscrowFromBob(order, snapshot)) return 'present'
  return 'missing'
}
