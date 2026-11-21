import {
  decode,
  deriveAddress,
  encodeForMultiSigning,
  hashes,
  multisign,
  verifyKeypairSignature,
  type Payment,
  type SubmittableTransaction,
} from 'xrpl'
import type {
  DepositReceipt,
  PaymentReceipt,
  ReleaseReceipt,
  RentalPaymentOrder,
  VaultResolutionMode,
} from '../shared/escrow-order.js'
import type { RoleSigner } from '../shared/signer.js'
import {
  AttemptStore,
  type Attempt,
  type AttemptState,
  type MultisigDraft,
  type PaymentAction,
} from './attempts.js'
import {
  EscrowLedger,
  LedgerUnavailable,
  type ManagedTransaction,
  type ValidatedLedger,
} from './ledger.js'
import {
  MEMO_TYPE_VAULT_PAYOUT,
  RIPPLE_EPOCH_SECONDS,
  buildEscrowCreate,
  buildEscrowFinish,
  buildFeeRefund,
  buildVaultPayout,
  matchesOrderMemo,
  normalizeHash,
  resolveVaultSettlement,
  validateRentalOrder,
} from './protocol.js'

const SINGLE_SIGNER_LEDGER_WINDOW = 8
const MULTISIG_LEDGER_WINDOW = 60

export interface AttemptResult {
  readonly hash: string
  readonly action: PaymentAction
  readonly sequence: number
  readonly state: AttemptState
  readonly ledgerIndex: number | null
  readonly ledgerHash: string | null
  readonly result: string | null
  readonly deliveredDrops: string | null
}

export interface DepositAttemptResult extends AttemptResult {
  readonly escrowObjectId: string
  readonly owner: string
  readonly finishAfter: number
  readonly deposit?: DepositReceipt
}

export interface ReleaseAttemptResult extends AttemptResult {
  readonly release?: ReleaseReceipt
}

export interface FeeRefundAttemptResult extends AttemptResult {
  readonly payment?: PaymentReceipt
}

export type VaultPayoutProgress =
  | {
      /** UI: "awaiting signatures" */
      readonly phase: 'awaiting_signatures'
      readonly orderId: string
      readonly vault: string
      readonly beneficiary: string
      readonly amountDrops: string
      readonly feeDrops: string
      readonly resolutionMode: VaultResolutionMode
      readonly preparedTransaction: Payment
      readonly allowedSigners: readonly string[]
      readonly collectedSigners: readonly string[]
      readonly lastLedgerSequence: number
    }
  | {
      /** UI: "awaiting ledger" */
      readonly phase: 'awaiting_ledger'
      readonly attempt: AttemptResult
    }
  | {
      /** Settlement completed and validated on ledger */
      readonly phase: 'validated'
      readonly attempt: AttemptResult
      readonly payment: PaymentReceipt
    }
  | {
      /** Attempt failed or expired on ledger: reconciled and ready for re-preparation */
      readonly phase: 'failed' | 'expired'
      readonly attempt: AttemptResult
    }

function toAttemptResult(attempt: Attempt): AttemptResult {
  return {
    hash: attempt.hash,
    action: attempt.action,
    sequence: attempt.sequence,
    state: attempt.state,
    ledgerIndex: attempt.ledgerIndex,
    ledgerHash: attempt.ledgerHash,
    result: attempt.result,
    deliveredDrops: attempt.deliveredDrops,
  }
}

interface DecodedPartialSigner {
  readonly Account: string
  readonly SigningPubKey: string
  readonly TxnSignature: string
}

function verifyAndExtractPartialSignature(
  partialTxBlob: string,
  expectedTx: Payment,
  allowedSigners: readonly string[],
): DecodedPartialSigner {
  const decoded = decode(partialTxBlob) as Record<string, unknown>
  if (decoded.SigningPubKey !== '' || decoded.TxnSignature !== undefined) {
    throw new Error('Partial blob must be signed in multisig mode (empty SigningPubKey)')
  }
  if (!Array.isArray(decoded.Signers) || decoded.Signers.length !== 1) {
    throw new Error('Partial blob must contain exactly one signer in Signers')
  }
  const wrapper = decoded.Signers[0] as { Signer?: Partial<DecodedPartialSigner> } | undefined
  const signer = wrapper?.Signer
  if (
    !signer ||
    typeof signer.Account !== 'string' ||
    typeof signer.SigningPubKey !== 'string' ||
    typeof signer.TxnSignature !== 'string'
  ) {
    throw new Error('Invalid Signer structure in partial blob')
  }
  if (!allowedSigners.includes(signer.Account)) {
    throw new Error(
      `Signer ${signer.Account} is not authorized for this settlement mode`,
    )
  }
  if (deriveAddress(signer.SigningPubKey) !== signer.Account) {
    throw new Error('Public key does not match signer address')
  }

  // Compare all transaction fields against the draft prepared by the backend.
  if (
    decoded.TransactionType !== 'Payment' ||
    decoded.Account !== expectedTx.Account ||
    decoded.Destination !== expectedTx.Destination ||
    decoded.Amount !== expectedTx.Amount ||
    decoded.Fee !== expectedTx.Fee ||
    decoded.Sequence !== expectedTx.Sequence ||
    decoded.LastLedgerSequence !== expectedTx.LastLedgerSequence ||
    decoded.TicketSequence !== undefined ||
    decoded.Delegate !== undefined ||
    decoded.Flags !== expectedTx.Flags
  ) {
    throw new Error('Signed blob does not match backend-prepared Payment transaction')
  }

  const expectedMemo = expectedTx.Memos?.[0]?.Memo
  const actualMemos = decoded.Memos as Array<{ Memo?: Record<string, unknown> }> | undefined
  if (
    !expectedMemo ||
    !Array.isArray(actualMemos) ||
    actualMemos.length !== 1 ||
    actualMemos[0]?.Memo?.MemoType !== expectedMemo.MemoType ||
    actualMemos[0]?.Memo?.MemoData !== expectedMemo.MemoData
  ) {
    throw new Error('Order memo missing or altered in partial signature')
  }

  const signingPayload = encodeForMultiSigning(expectedTx, signer.Account)
  if (!verifyKeypairSignature(signingPayload, signer.TxnSignature, signer.SigningPubKey)) {
    throw new Error(`Invalid cryptographic signature for ${signer.Account}`)
  }

  return {
    Account: signer.Account,
    SigningPubKey: signer.SigningPubKey,
    TxnSignature: signer.TxnSignature,
  }
}

export class EscrowService {
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(
    private readonly ledger: EscrowLedger,
    private readonly attempts: AttemptStore,
  ) {}

  private withOrderActionLock<T>(orderId: string, action: string, fn: () => Promise<T>): Promise<T> {
    const key = `${orderId}:${action}`
    const active = this.inFlight.get(key)
    if (active) return active as Promise<T>
    const run = fn().finally(() => {
      if (this.inFlight.get(key) === run) {
        this.inFlight.delete(key)
      }
    })
    this.inFlight.set(key, run)
    return run
  }

  /**
   * Deposits the order net amount into a new time-locked Escrow object (Bob -> Vault, FinishAfter = endAt).
   */
  async deposit(order: RentalPaymentOrder, bobSigner: RoleSigner): Promise<DepositAttemptResult> {
    return this.withOrderActionLock(order.orderId, 'escrow_create', async () => {
      const { checkoutBy, finishAfter } = validateRentalOrder(order)
      if (bobSigner.address !== order.bob) {
        throw new Error('Signer differs from Bob specified in the order')
      }

      const existing = this.activeForOrder(order, 'escrow_create')
      if (existing) {
        const reconciled = await this.reconcile(existing.hash, true)
        return this.enrichDepositResult(order, reconciled, finishAfter)
      }

      await this.reconcileAccountIfPending(order.bob)

      const snapshot = await this.ledger.snapshot()
      await this.ledger.assertVaultReadyForOrder(order, snapshot)

      const transaction = buildEscrowCreate(order)
      const sent = await this.signSingleAndSubmit(
        order.orderId,
        order.agreementHash,
        'escrow_create',
        transaction,
        snapshot,
        bobSigner,
        checkoutBy,
        {
          destination: order.vault,
          amountDrops: order.netDrops,
          finishAfter,
        },
      )
      return this.enrichDepositResult(order, sent, finishAfter)
    })
  }

  /**
   * Releases the matured escrow, transferring the net amount to the scenario vault (EscrowFinish).
   */
  async releaseToVault(
    order: RentalPaymentOrder,
    createHash: string,
    operatorSigner: RoleSigner,
  ): Promise<ReleaseAttemptResult> {
    const { finishAfter } = validateRentalOrder(order)
    const depositOrder = { ...order, createHash: normalizeHash(createHash, 'createHash') }

    const existing = this.activeForOrder(order, 'escrow_finish')
    if (existing) {
      const reconciled = await this.reconcile(existing.hash, true)
      if (reconciled.state === 'validated') {
        const status = await this.ledger.verifyEscrow(depositOrder)
        if (status.state === 'credited_to_vault') {
          return { ...reconciled, release: status.release }
        }
      }
      return reconciled
    }

    await this.reconcileAccountIfPending(operatorSigner.address)

    const snapshot = await this.ledger.snapshot()
    const escrowStatus = await this.ledger.verifyEscrowAt(depositOrder, snapshot)
    if (escrowStatus.state === 'credited_to_vault') {
      return {
        hash: escrowStatus.release.txHash,
        action: 'escrow_finish',
        sequence: escrowStatus.deposit.sequence,
        state: 'validated',
        ledgerIndex: escrowStatus.release.ledgerIndex,
        ledgerHash: escrowStatus.release.ledgerHash,
        result: 'tesSUCCESS',
        deliveredDrops: order.netDrops,
        release: escrowStatus.release,
      }
    }
    if (escrowStatus.state !== 'releasable' || snapshot.closeTime <= finishAfter) {
      throw new Error(
        `Escrow not yet releasable (state: ${escrowStatus.state}, closeTime: ${snapshot.closeTime}, finishAfter: ${finishAfter})`,
      )
    }

    const tx = buildEscrowFinish(order, escrowStatus.deposit, operatorSigner.address)
    const attempt = await this.signSingleAndSubmit(
      order.orderId,
      order.agreementHash,
      'escrow_finish',
      tx,
      snapshot,
      operatorSigner,
      null,
      {
        vault: order.vault,
        amountDrops: order.netDrops,
        escrowObjectId: escrowStatus.deposit.escrowObjectId,
      },
    )

    if (attempt.state === 'validated') {
      const refreshed = await this.ledger.verifyEscrow(depositOrder)
      if (refreshed.state === 'credited_to_vault') {
        return { ...attempt, release: refreshed.release }
      }
    }
    return attempt
  }

  /**
   * Prepares (or returns if active) the 2-of-3 Payment transaction from the vault to the beneficiary,
   * calling client.autofill(tx, 2) once.
   */
  async prepareVaultPayout(
    order: RentalPaymentOrder,
    createHash: string,
    mode: VaultResolutionMode = 'ordinary',
  ): Promise<VaultPayoutProgress> {
    const { beneficiary, allowedSigners } = resolveVaultSettlement(order, mode)
    const depositOrder = { ...order, createHash: normalizeHash(createHash, 'createHash') }

    // 1. If a submitted attempt already exists (pending or validated), reconcile it before collecting new signatures.
    const existingAttempt = this.activeForOrder(order, 'vault_payout')
    if (existingAttempt) {
      const reconciled = await this.reconcile(existingAttempt.hash, true)
      if (reconciled.state === 'pending') {
        return { phase: 'awaiting_ledger', attempt: reconciled }
      }
      if (reconciled.state === 'validated') {
        const snapshot = await this.ledger.snapshot()
        const payment = await this.ledger.verifyValidatedPayment(
          reconciled.hash,
          order.vault,
          existingAttempt.destination ?? beneficiary,
          order.netDrops,
          snapshot,
        )
        if (!payment) return { phase: 'awaiting_ledger', attempt: reconciled }
        return { phase: 'validated', attempt: reconciled, payment }
      }
      this.attempts.clearExpiredSubmittedMultisigDraft(order.orderId, reconciled.hash)
      return { phase: reconciled.state, attempt: reconciled }
    }

    await this.reconcileAccountIfPending(order.vault)

    const snapshot = await this.ledger.snapshot()
    await this.ledger.assertVaultReadyForOrder(order, snapshot)
    const escrowStatus = await this.ledger.verifyEscrowAt(depositOrder, snapshot)
    if (escrowStatus.state !== 'credited_to_vault') {
      throw new Error(
        `Net amount is not yet credited to the vault (escrow state: ${escrowStatus.state})`,
      )
    }

    // 2. Reuse the signature-collection draft if still valid for the same order and mode.
    const existingDraft = this.attempts.getMultisigDraft(order.orderId)
    if (existingDraft && existingDraft.submittedHash === null) {
      if (existingDraft.agreementHash !== order.agreementHash) {
        throw new Error('agreementHash differs from recorded multisig draft')
      }
      if (snapshot.index < existingDraft.lastLedger && existingDraft.resolutionMode === mode) {
        return this.draftToProgress(existingDraft, allowedSigners)
      }
      this.attempts.clearUnsubmittedMultisigDraft(order.orderId)
    }

    // 3. Prepare Payment once with SigningPubKey: "" and autofill(tx, 2).
    const unsigned = buildVaultPayout(order, mode)
    const reserves = await this.ledger.readReserves()
    const prepared = await this.ledger.fill(unsigned, snapshot, {
      multisigSigners: 2,
      ledgerWindow: MULTISIG_LEDGER_WINDOW,
    })
    const minMultisigFee = reserves.baseFeeDrops * 3n
    if (
      prepared.SigningPubKey !== '' ||
      prepared.Sequence == null ||
      !Number.isInteger(prepared.Sequence) ||
      prepared.Sequence < 1 ||
      prepared.TicketSequence != null ||
      prepared.LastLedgerSequence !== snapshot.index + MULTISIG_LEDGER_WINDOW ||
      typeof prepared.Fee !== 'string' ||
      !/^[1-9][0-9]*$/.test(prepared.Fee) ||
      BigInt(prepared.Fee) < minMultisigFee
    ) {
      throw new Error('Invalid multisig autofill parameters (Fee >= 3x, Sequence, SigningPubKey)')
    }

    const saved = this.attempts.saveMultisigDraft({
      orderId: order.orderId,
      agreementHash: order.agreementHash,
      vault: order.vault,
      beneficiary,
      amountDrops: order.netDrops,
      resolutionMode: mode,
      preparedTxJson: JSON.stringify(prepared),
      feeDrops: prepared.Fee,
      sequence: prepared.Sequence,
      minLedger: snapshot.index + 1,
      lastLedger: prepared.LastLedgerSequence,
    })

    return this.draftToProgress(saved, allowedSigners)
  }

  /**
   * Records a 2-of-3 partial signature on the prepared vault Payment transaction.
   * On the second valid distinct signature, combines blobs with xrpl.multisign, records hash, and submits.
   */
  async addVaultSignature(
    order: RentalPaymentOrder,
    partialTxBlob: string,
  ): Promise<VaultPayoutProgress> {
    validateRentalOrder(order)

    const existingAttempt = this.activeForOrder(order, 'vault_payout')
    if (existingAttempt) {
      const reconciled = await this.reconcile(existingAttempt.hash, true)
      if (reconciled.state === 'validated') {
        const snapshot = await this.ledger.snapshot()
        const payment = await this.ledger.verifyValidatedPayment(
          reconciled.hash,
          order.vault,
          existingAttempt.destination ?? order.alice,
          order.netDrops,
          snapshot,
        )
        if (payment) return { phase: 'validated', attempt: reconciled, payment }
      }
      return { phase: 'awaiting_ledger', attempt: reconciled }
    }

    const draft = this.attempts.getMultisigDraft(order.orderId)
    if (!draft || draft.submittedHash !== null) {
      throw new Error('No active multisig draft for this order: call prepareVaultPayout')
    }
    if (draft.agreementHash !== order.agreementHash) {
      throw new Error('agreementHash differs from recorded multisig draft')
    }

    const { beneficiary, allowedSigners } = resolveVaultSettlement(order, draft.resolutionMode)
    const preparedTx = JSON.parse(draft.preparedTxJson) as Payment
    if (
      !matchesOrderMemo(preparedTx.Memos, MEMO_TYPE_VAULT_PAYOUT, order.orderId, order.agreementHash)
    ) {
      throw new Error('Multisig draft memo inconsistent with order')
    }

    const signerInfo = verifyAndExtractPartialSignature(partialTxBlob, preparedTx, allowedSigners)

    const snapshot = await this.ledger.snapshot()
    if (snapshot.index >= draft.lastLedger) {
      this.attempts.clearUnsubmittedMultisigDraft(order.orderId)
      throw new Error('Multisig draft LastLedgerSequence window expired: re-prepare transaction')
    }

    // Idempotent if the same first signer submits their signature twice.
    if (draft.sig1Signer === null) {
      const updated = this.attempts.saveFirstPartialSignature(
        order.orderId,
        signerInfo.Account,
        partialTxBlob,
      )
      return this.draftToProgress(updated, allowedSigners)
    }

    if (draft.sig1Signer === signerInfo.Account) {
      return this.draftToProgress(draft, allowedSigners)
    }

    if (!draft.sig1Blob) {
      throw new Error('Inconsistent internal multisig draft state')
    }

    const combinedBlob = multisign([draft.sig1Blob, partialTxBlob])
    const combinedHash = hashes.hashSignedTx(combinedBlob).toUpperCase()

    const recorded = this.attempts.finalizeMultisigDraftSubmission(
      order.orderId,
      signerInfo.Account,
      partialTxBlob,
      {
        orderId: order.orderId,
        agreementHash: order.agreementHash,
        action: 'vault_payout',
        account: order.vault,
        destination: beneficiary,
        amountDrops: order.netDrops,
        hash: combinedHash,
        blob: combinedBlob,
        sequence: draft.sequence,
        minLedger: draft.minLedger,
        lastLedger: draft.lastLedger,
        broadcastUntil: null,
      },
    )

    const reconciled = await this.reconcile(recorded.hash, true)
    if (reconciled.state === 'validated') {
      const latest = await this.ledger.snapshot()
      const payment = await this.ledger.verifyValidatedPayment(
        reconciled.hash,
        order.vault,
        beneficiary,
        order.netDrops,
        latest,
      )
      if (payment) {
        return { phase: 'validated', attempt: reconciled, payment }
      }
    }
    if (reconciled.state === 'failed' || reconciled.state === 'expired') {
      this.attempts.clearExpiredSubmittedMultisigDraft(order.orderId, reconciled.hash)
      return { phase: reconciled.state, attempt: reconciled }
    }
    return { phase: 'awaiting_ledger', attempt: reconciled }
  }

  /**
   * Convenience helper to sequentially collect both signatures via RoleSigner and submit settlement.
   */
  async settleVault(
    order: RentalPaymentOrder,
    createHash: string,
    mode: VaultResolutionMode,
    firstSigner: RoleSigner,
    secondSigner: RoleSigner,
  ): Promise<VaultPayoutProgress> {
    if (firstSigner.address === secondSigner.address) {
      throw new Error('Two distinct signers are required for 2-of-3 multisig')
    }
    const initial = await this.prepareVaultPayout(order, createHash, mode)
    if (initial.phase !== 'awaiting_signatures') {
      return initial
    }

    const promptContext = {
      orderId: order.orderId,
      action: 'vault_payout' as const,
      feeDrops: initial.feeDrops,
      summary: {
        vault: initial.vault,
        beneficiary: initial.beneficiary,
        amountDrops: initial.amountDrops,
        resolutionMode: initial.resolutionMode,
      },
    }

    let current: VaultPayoutProgress = initial
    if (!current.collectedSigners.includes(firstSigner.address)) {
      const partial1 = await firstSigner.signForMultisig(current.preparedTransaction, promptContext)
      current = await this.addVaultSignature(order, partial1.tx_blob)
    }
    if (current.phase === 'awaiting_signatures' && !current.collectedSigners.includes(secondSigner.address)) {
      const partial2 = await secondSigner.signForMultisig(current.preparedTransaction, promptContext)
      current = await this.addVaultSignature(order, partial2.tx_blob)
    }
    return current
  }

  /**
   * Refunds the fee once (e.g. 1 XRP) from the authority to Bob when the pass was paid
   * but the escrow deposit is confirmed absent past checkoutDeadline.
   */
  async refundFee(
    order: RentalPaymentOrder,
    acceptOfferHash: string,
    authoritySigner: RoleSigner,
  ): Promise<FeeRefundAttemptResult> {
    const { checkoutBy } = validateRentalOrder(order)
    if (authoritySigner.address !== order.authority) {
      throw new Error('Signer differs from competent authority on the order')
    }

    const existingRefund = this.activeForOrder(order, 'fee_refund')
    if (existingRefund) {
      const reconciled = await this.reconcile(existingRefund.hash, true)
      if (reconciled.state === 'validated') {
        const snapshot = await this.ledger.snapshot()
        const payment = await this.ledger.verifyValidatedPayment(
          reconciled.hash,
          order.authority,
          order.bob,
          order.feeDrops,
          snapshot,
        )
        return payment ? { ...reconciled, payment } : reconciled
      }
      return reconciled
    }

    // Reconcile any pending deposit attempts first.
    const depositAttempt = this.activeForOrder(order, 'escrow_create')
    if (depositAttempt) {
      const reconciledDeposit = await this.reconcile(depositAttempt.hash, false)
      if (reconciledDeposit.state === 'pending') {
        throw new Error('Escrow deposit still verifying on the ledger: premature fee refund forbidden')
      }
      if (reconciledDeposit.state === 'validated') {
        throw new Error('Validated escrow deposit exists: order ineligible for missing-deposit refund')
      }
    }

    await this.reconcileAccountIfPending(order.authority)

    const snapshot = await this.ledger.snapshot()
    if (snapshot.closeTime <= checkoutBy) {
      throw new Error('Checkout deadline has not expired on validated ledger yet')
    }

    if (order.createHash !== undefined) {
      const status = await this.ledger.verifyEscrowAt(
        { ...order, createHash: order.createHash },
        snapshot,
      )
      if (status.state === 'pending') {
        throw new Error('Order createHash is still verifying')
      }
      if (
        status.state === 'locked' ||
        status.state === 'releasable' ||
        status.state === 'credited_to_vault'
      ) {
        throw new Error('Valid deposit exists for order: fee refund not permitted')
      }
    }

    if (await this.ledger.hasMatchingActiveEscrowFromBob(order, snapshot)) {
      throw new Error('Detected an active Escrow object belonging to Bob matching this order on the ledger')
    }

    const feeWasCollected = await this.ledger.verifyPassFeeCollected(
      order,
      acceptOfferHash,
      snapshot,
    )
    if (!feeWasCollected) {
      throw new Error(
        'No verified fee collection found on the ledger for this pass: cannot issue refund',
      )
    }

    const tx = buildFeeRefund(order)
    const sent = await this.signSingleAndSubmit(
      order.orderId,
      order.agreementHash,
      'fee_refund',
      tx,
      snapshot,
      authoritySigner,
      null,
      {
        beneficiary: order.bob,
        amountDrops: order.feeDrops,
      },
    )

    if (sent.state === 'validated') {
      const latest = await this.ledger.snapshot()
      const payment = await this.ledger.verifyValidatedPayment(
        sent.hash,
        order.authority,
        order.bob,
        order.feeDrops,
        latest,
      )
      return payment ? { ...sent, payment } : sent
    }
    return sent
  }

  /**
   * Reconciles a recorded attempt by querying the validated ledger.
   * When retry = true, re-broadcasts the same tx_blob if still within LastLedgerSequence and deadline.
   */
  async reconcile(hash: string, retry = false): Promise<AttemptResult> {
    const attempt = this.attempts.get(hash)
    if (attempt.state !== 'pending') return toAttemptResult(attempt)

    try {
      const snapshot = await this.ledger.snapshot()
      const lookup = await this.ledger.lookup(attempt.hash, {
        min: attempt.minLedger,
        max: attempt.lastLedger,
      })

      if (lookup.state === 'found' && lookup.tx.ledgerIndex <= snapshot.index) {
        return this.finalizeFoundAttempt(attempt, lookup.tx)
      }

      if (lookup.state === 'missing' && lookup.searchedAll && snapshot.index >= attempt.lastLedger) {
        const expired = this.attempts.complete(attempt.hash, 'expired', {
          ledgerIndex: null,
          ledgerHash: null,
          result: 'txnNotFound',
          deliveredDrops: null,
        })
        if (attempt.action === 'vault_payout') {
          this.attempts.clearExpiredSubmittedMultisigDraft(attempt.orderId, attempt.hash)
        }
        return toAttemptResult(expired)
      }

      if (
        retry &&
        lookup.state === 'missing' &&
        snapshot.index < attempt.lastLedger &&
        this.withinDeadline(snapshot, attempt.broadcastUntil, attempt.action)
      ) {
        await this.ledger.broadcast(attempt.blob)
        const postSnap = await this.ledger.snapshot()
        const postLookup = await this.ledger.lookup(attempt.hash, {
          min: attempt.minLedger,
          max: attempt.lastLedger,
        })
        if (postLookup.state === 'found' && postLookup.tx.ledgerIndex <= postSnap.index) {
          return this.finalizeFoundAttempt(attempt, postLookup.tx)
        }
      }
    } catch (error) {
      if (!(error instanceof LedgerUnavailable)) throw error
    }
    return toAttemptResult(this.attempts.get(attempt.hash))
  }

  private finalizeFoundAttempt(
    attempt: Attempt,
    tx: {
      readonly ledgerIndex: number
      readonly ledgerHash: string
      readonly metadata: {
        readonly TransactionResult: string
        readonly delivered_amount?: unknown
        readonly DeliveredAmount?: unknown
      }
    },
  ): AttemptResult {
    const txResult = tx.metadata.TransactionResult
    const rawDelivered = tx.metadata.delivered_amount ?? tx.metadata.DeliveredAmount
    const deliveredDrops =
      typeof rawDelivered === 'string' && /^[1-9][0-9]*$/.test(rawDelivered)
        ? rawDelivered
        : null

    if (
      txResult === 'tesSUCCESS' &&
      (attempt.action === 'vault_payout' || attempt.action === 'fee_refund') &&
      attempt.amountDrops !== null &&
      deliveredDrops !== attempt.amountDrops
    ) {
      throw new Error(
        `delivered_amount anomaly on ${attempt.action}: expected ${attempt.amountDrops}, got ${deliveredDrops}`,
      )
    }

    const completed = this.attempts.complete(
      attempt.hash,
      txResult === 'tesSUCCESS' ? 'validated' : 'failed',
      {
        ledgerIndex: tx.ledgerIndex,
        ledgerHash: tx.ledgerHash,
        result: txResult,
        deliveredDrops,
      },
    )
    return toAttemptResult(completed)
  }

  /**
   * Reconciles all pending attempts for an order and tells Person C
   * whether the associated vault may be safely released.
   */
  async reconcileOrder(orderId: string, retry = false): Promise<{
    readonly attempts: readonly AttemptResult[]
    readonly hasPendingOperations: boolean
    readonly canReleaseVault: boolean
  }> {
    const initial = this.attempts.listByOrder(orderId)
    const results: AttemptResult[] = []
    for (const item of initial) {
      results.push(item.state === 'pending' ? await this.reconcile(item.hash, retry) : toAttemptResult(item))
    }

    const hasPending = results.some((r) => r.state === 'pending')
    const draft = this.attempts.getMultisigDraft(orderId)
    const hasActiveUnsubmittedDraft = draft !== undefined && draft.submittedHash === null

    const depositValidated = results.some(
      (r) => r.action === 'escrow_create' && r.state === 'validated',
    )
    const payoutValidated = results.some(
      (r) => r.action === 'vault_payout' && r.state === 'validated',
    )

    // If deposit was validated, the vault cannot be released until vault_payout is validated.
    const canReleaseVault =
      !hasPending && !hasActiveUnsubmittedDraft && (!depositValidated || payoutValidated)

    return {
      attempts: results,
      hasPendingOperations: hasPending,
      canReleaseVault,
    }
  }

  private activeForOrder(order: RentalPaymentOrder, action: PaymentAction): Attempt | undefined {
    const existing = this.attempts.active(order.orderId, action)
    if (existing && existing.agreementHash !== order.agreementHash) {
      throw new Error('agreementHash differs from attempt already recorded for order')
    }
    return existing
  }

  private async reconcileAccountIfPending(account: string): Promise<void> {
    const pending = this.attempts.pendingForAccount(account)
    if (!pending) return
    const updated = await this.reconcile(pending.hash, true)
    if (updated.state === 'pending') {
      throw new Error(
        `Wallet ${account} still has transaction ${pending.hash} verifying on the ledger`,
      )
    }
  }

  private withinDeadline(
    snapshot: ValidatedLedger,
    deadline: number | null,
    action: PaymentAction,
  ): boolean {
    if (deadline === null) return true
    if (snapshot.closeTime > deadline) return false
    return (
      action !== 'escrow_create' ||
      Math.floor(this.ledger.nowMillis() / 1000) - RIPPLE_EPOCH_SECONDS < deadline
    )
  }

  private draftToProgress(
    draft: MultisigDraft,
    allowedSigners: readonly string[],
  ): VaultPayoutProgress {
    const collectedSigners = [draft.sig1Signer, draft.sig2Signer].filter(
      (s): s is string => typeof s === 'string',
    )
    return {
      phase: 'awaiting_signatures',
      orderId: draft.orderId,
      vault: draft.vault,
      beneficiary: draft.beneficiary,
      amountDrops: draft.amountDrops,
      feeDrops: draft.feeDrops,
      resolutionMode: draft.resolutionMode,
      preparedTransaction: JSON.parse(draft.preparedTxJson) as Payment,
      allowedSigners,
      collectedSigners,
      lastLedgerSequence: draft.lastLedger,
    }
  }

  private async enrichDepositResult(
    order: RentalPaymentOrder,
    result: AttemptResult,
    finishAfter: number,
  ): Promise<DepositAttemptResult> {
    const escrowObjectId = hashes.hashEscrow(order.bob, result.sequence).toUpperCase()
    if (result.state === 'validated' && result.ledgerIndex !== null && result.ledgerHash !== null) {
      return {
        ...result,
        escrowObjectId,
        owner: order.bob,
        finishAfter,
        deposit: {
          txHash: result.hash,
          ledgerHash: result.ledgerHash,
          ledgerIndex: result.ledgerIndex,
          owner: order.bob,
          destination: order.vault,
          amountDrops: order.netDrops,
          finishAfter,
          sequence: result.sequence,
          escrowObjectId,
        },
      }
    }
    return {
      ...result,
      escrowObjectId,
      owner: order.bob,
      finishAfter,
    }
  }

  async signSingleAndSubmit(
    orderId: string,
    agreementHash: string,
    action: PaymentAction,
    transaction: ManagedTransaction,
    snapshot: ValidatedLedger,
    signer: RoleSigner,
    broadcastUntil: number | null,
    summary: Readonly<Record<string, string | number>>,
  ): Promise<AttemptResult> {
    if (signer.address !== transaction.Account) {
      throw new Error(`Signer ${signer.address} differs from Account ${transaction.Account}`)
    }
    if (!this.withinDeadline(snapshot, broadcastUntil, action)) {
      throw new Error('Signing time window expired')
    }

    const prepared = await this.ledger.fill(transaction as SubmittableTransaction, snapshot, {
      ledgerWindow: SINGLE_SIGNER_LEDGER_WINDOW,
    })
    const { Sequence, LastLedgerSequence, Fee } = prepared
    if (
      Sequence == null ||
      !Number.isInteger(Sequence) ||
      Sequence < 1 ||
      prepared.TicketSequence != null ||
      LastLedgerSequence !== snapshot.index + SINGLE_SIGNER_LEDGER_WINDOW ||
      typeof Fee !== 'string' ||
      !/^[1-9][0-9]*$/.test(Fee)
    ) {
      throw new Error('Invalid XRPL autofill parameters')
    }

    const signed = await signer.signSingle(prepared, {
      orderId,
      action,
      feeDrops: Fee,
      summary,
    })

    const latest = await this.ledger.snapshot()
    if (
      latest.index >= LastLedgerSequence ||
      latest.index < snapshot.index ||
      !this.withinDeadline(latest, broadcastUntil, action)
    ) {
      throw new Error('Signing window expired before ledger submission')
    }

    const destination =
      'Destination' in transaction && typeof transaction.Destination === 'string'
        ? transaction.Destination
        : null
    const amountDrops =
      'Amount' in transaction && typeof transaction.Amount === 'string'
        ? transaction.Amount
        : null

    const recorded = this.attempts.record({
      orderId,
      agreementHash,
      action,
      account: signer.address,
      destination,
      amountDrops,
      hash: signed.hash.toUpperCase(),
      blob: signed.tx_blob,
      sequence: Sequence,
      minLedger: snapshot.index + 1,
      lastLedger: LastLedgerSequence,
      broadcastUntil,
    })

    return this.reconcile(recorded.hash, true)
  }
}
