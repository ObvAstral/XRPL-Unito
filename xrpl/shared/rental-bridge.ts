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
 * Traduce l'accordo verificato da Persona A nell'ordine di pagamento di Persona B.
 * `agreementHash` e' il digest dell'ordine firmato (lo stesso della URI del pass).
 * `scenario` non sta nell'accordo: lo sceglie il backend insieme al vault.
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

/** Adatta il LocalSigner di Persona A al RoleSigner che l'escrow invoca. */
export function adaptLocalSigner(
  signer: LocalSigner,
  confirm: ConfirmPrompt = async () => true,
): RoleSigner {
  return {
    address: signer.classicAddress,
    async signSingle(tx, context) {
      if (tx.Account !== signer.classicAddress) {
        throw new Error(`Firmatario ${signer.classicAddress} diverso da Account ${tx.Account}`)
      }
      if (!(await confirm(context))) throw new Error('Firma rifiutata dall’utente')
      const { hash, tx_blob } = signer.sign(tx)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: signer.classicAddress }
    },
    async signForMultisig(tx, context) {
      if (tx.SigningPubKey !== '') {
        throw new Error('La transazione multifirma deve avere SigningPubKey vuota')
      }
      if (!(await confirm(context))) throw new Error('Firma parziale rifiutata dall’utente')
      const { hash, tx_blob } = signer.signPartial(tx)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: signer.classicAddress }
    },
  }
}

/**
 * Vocabolario della revoca (A): solo `missing` autorizza il burn.
 * `mismatch` resta `present`: c'e' un oggetto che non coincide coi termini, non si brucia.
 */
export function escrowStateForRevoke(
  state: OrderEscrowStatus['state'],
): 'missing' | 'present' | 'pending' {
  if (state === 'missing') return 'missing'
  if (state === 'pending') return 'pending'
  return 'present'
}

/**
 * Stato deposito da passare a `RentalNfts.revokePass`, sullo snapshot gia' usato per il pass.
 * Senza `createHash` cerca un Escrow attivo di Bob. `attemptsPending` blocca il burn finche'
 * l'AttemptStore non ha riconciliato l'invio.
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
