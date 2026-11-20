import type { Wallet } from 'xrpl'
import type { EscrowDepositOrder, EscrowOrder } from '../shared/escrow-order.js'
import { AttemptStore, type Attempt, type EscrowAction } from './attempts.js'
import {
  EscrowLedger, LedgerUnavailable, type EscrowTransaction, type ValidatedLedger,
} from './ledger.js'
import { encodeFulfillment, escrowCreate, escrowTimes, RIPPLE_EPOCH_SECONDS } from './protocol.js'

export type VerifyRegisteredAgreement<Bundle> = (bundle: Bundle) => Promise<{
  order: EscrowOrder
  registeredAgreementHash: string
}>

export interface VerifiedDelivery {
  readonly orderId: string
  readonly agreementHash: string
  readonly escrowId: string
  readonly preimage: Uint8Array
}

export type Confirm = (details: {
  readonly action: EscrowAction
  readonly order: Readonly<EscrowOrder>
  readonly feeDrops: string
}) => Promise<boolean>

export interface AttemptResult {
  readonly hash: string
  readonly sequence: number
  readonly state: Attempt['state']
  readonly ledgerIndex: number | null
  readonly result: string | null
}

function publicResult({ hash, sequence, state, ledgerIndex, result }: Attempt): AttemptResult {
  return { hash, sequence, state, ledgerIndex, result }
}

export class EscrowService {
  constructor(private readonly ledger: EscrowLedger, private readonly attempts: AttemptStore) {}

  /** Il verificatore controlla le due firme e legge la registrazione dall’oracolo autenticato. */
  async fund<Bundle>(
    bundle: Bundle,
    verify: VerifyRegisteredAgreement<Bundle>,
    wallet: Wallet,
    confirm: Confirm,
  ): Promise<AttemptResult> {
    const { order: verified, registeredAgreementHash } = await verify(bundle)
    const order = { ...verified }
    if (registeredAgreementHash !== order.agreementHash) throw new Error('AGREEMENT_NOT_READY')
    const transaction = escrowCreate(order)
    this.checkSigner(wallet, transaction.Account)
    const existing = this.existing(order, 'fund')
    if (existing) return this.reconcile(existing.hash, true)

    const { fundBy } = escrowTimes(order)
    const snapshot = await this.ledger.snapshot()
    return this.signAndSend(order, 'fund', transaction, snapshot, wallet, confirm, fundBy)
  }

  /** Il callback legge il verdetto positivo persistito e verifica la copia del PNG prima di restituire il segreto. */
  async finish(
    order: EscrowDepositOrder,
    wallet: Wallet,
    loadVerifiedDelivery: (orderId: string) => Promise<VerifiedDelivery | undefined>,
    confirm: Confirm,
  ): Promise<AttemptResult> {
    this.checkSigner(wallet, order.oracle)
    const existing = this.existing(order, 'finish')
    if (existing) return this.reconcile(existing.hash, true)

    const snapshot = await this.ledger.snapshot()
    const status = await this.ledger.verifyAt(order, snapshot)
    const { finishAfter, cancelAfter } = escrowTimes(order)
    if (status.state !== 'held' || snapshot.closeTime <= finishAfter) throw new Error('Escrow fuori finestra di incasso')
    const delivery = await loadVerifiedDelivery(order.orderId)
    if (!delivery || delivery.orderId !== order.orderId || delivery.agreementHash !== order.agreementHash
      || delivery.escrowId !== status.deposit.objectId) throw new Error('Consegna verificata richiesta')

    return this.signAndSend(order, 'finish', {
      TransactionType: 'EscrowFinish',
      Account: order.oracle,
      Owner: status.deposit.owner,
      OfferSequence: status.deposit.sequence,
      Condition: order.condition.toUpperCase(),
      Fulfillment: encodeFulfillment(delivery.preimage, order.condition),
    }, snapshot, wallet, confirm, cancelAfter)
  }

  async recover(order: EscrowDepositOrder, wallet: Wallet, confirm: Confirm): Promise<AttemptResult> {
    this.checkSigner(wallet, order.bob)
    const existing = this.existing(order, 'recover')
    if (existing) return this.reconcile(existing.hash, true)
    const snapshot = await this.ledger.snapshot()
    const status = await this.ledger.verifyAt(order, snapshot)
    if (status.state !== 'refundable') throw new Error('Deposito non annullabile')
    return this.signAndSend(order, 'recover', {
      TransactionType: 'EscrowCancel',
      Account: order.bob,
      Owner: status.deposit.owner,
      OfferSequence: status.deposit.sequence,
    }, snapshot, wallet, confirm, null)
  }

  async reconcile(hash: string, retry = false): Promise<AttemptResult> {
    const attempt = this.attempts.get(hash)
    if (attempt.state !== 'pending') return publicResult(attempt)

    try {
      const snapshot = await this.ledger.snapshot()
      const lookup = await this.ledger.lookup(hash, { min: attempt.minLedger, max: attempt.lastLedger })
      if (lookup.state === 'found' && lookup.tx.ledgerIndex <= snapshot.index) {
        const result = lookup.tx.metadata.TransactionResult
        return publicResult(this.attempts.complete(hash, result === 'tesSUCCESS' ? 'validated' : 'failed',
          lookup.tx.ledgerIndex, result))
      }
      if (lookup.state === 'missing' && lookup.searchedAll && snapshot.index >= attempt.lastLedger) {
        return publicResult(this.attempts.complete(hash, 'expired', null, 'txnNotFound'))
      }
      if (retry && lookup.state === 'missing' && snapshot.index < attempt.lastLedger
        && this.withinDeadline(snapshot, attempt.broadcastUntil, attempt.action)) {
        await this.ledger.broadcast(attempt.blob)
      }
    } catch (error) {
      if (!(error instanceof LedgerUnavailable)) throw error
    }
    return publicResult(this.attempts.get(hash))
  }

  private existing(order: EscrowOrder, action: EscrowAction) {
    const existing = this.attempts.active(order.orderId, action)
    if (existing && existing.agreementHash !== order.agreementHash) throw new Error('Accordo diverso dal tentativo registrato')
    return existing
  }

  private checkSigner(wallet: Wallet, account: string) {
    if (wallet.classicAddress !== account) throw new Error('Firmatario diverso da quello concordato')
  }

  private withinDeadline(snapshot: ValidatedLedger, deadline: number | null, action: EscrowAction) {
    if (deadline === null) return true
    if (snapshot.closeTime > deadline) return false
    return action !== 'fund'
      || Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_SECONDS < deadline
  }

  private async signAndSend(
    order: Readonly<EscrowOrder>,
    action: EscrowAction,
    transaction: EscrowTransaction,
    snapshot: ValidatedLedger,
    wallet: Wallet,
    confirm: Confirm,
    broadcastUntil: number | null,
  ): Promise<AttemptResult> {
    if (!this.withinDeadline(snapshot, broadcastUntil, action)) throw new Error('Finestra di firma scaduta')
    const prepared = await this.ledger.fill(transaction, snapshot)
    const { Sequence, LastLedgerSequence, Fee } = prepared
    if (Sequence == null || !Number.isInteger(Sequence) || Sequence < 1 || prepared.TicketSequence != null
      || LastLedgerSequence !== snapshot.index + 4 || !Fee || !/^[1-9][0-9]*$/.test(Fee)) {
      throw new Error('Parametri di firma XRPL non validi')
    }
    // Consegna alla CLI soltanto i termini pubblici e la commissione da approvare.
    const { orderId, agreementHash, network, bob, alice, oracle, amountDrops, condition, fundBy, deliverBy } = order
    if (!(await confirm({ action, order: {
      orderId, agreementHash, network, bob, alice, oracle, amountDrops, condition, fundBy, deliverBy,
    }, feeDrops: Fee }))) throw new Error('Firma non confermata')

    const latest = await this.ledger.snapshot()
    if (latest.index >= LastLedgerSequence || latest.index < snapshot.index
      || !this.withinDeadline(latest, broadcastUntil, action)) throw new Error('Finestra di firma scaduta')

    const { hash, tx_blob: blob } = wallet.sign(prepared)
    const stored = this.attempts.record({
      orderId, agreementHash, action, account: wallet.classicAddress, hash, blob,
      sequence: Sequence, minLedger: snapshot.index + 1, lastLedger: LastLedgerSequence, broadcastUntil,
    })
    return this.reconcile(stored.hash, true)
  }
}
