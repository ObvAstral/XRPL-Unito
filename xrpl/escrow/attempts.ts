import { closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { VaultResolutionMode } from '../shared/escrow-order.js'

export type PaymentAction =
  | 'vault_signer_list'
  | 'vault_disable_master'
  | 'escrow_create'
  | 'escrow_finish'
  | 'vault_payout'
  | 'fee_refund'

export type AttemptState = 'pending' | 'validated' | 'failed' | 'expired'

export interface Attempt {
  readonly orderId: string
  readonly agreementHash: string
  readonly action: PaymentAction
  readonly account: string
  readonly destination: string | null
  readonly amountDrops: string | null
  readonly hash: string
  readonly blob: string
  readonly sequence: number
  readonly minLedger: number
  readonly lastLedger: number
  readonly broadcastUntil: number | null
  readonly state: AttemptState
  readonly ledgerIndex: number | null
  readonly ledgerHash: string | null
  readonly result: string | null
  readonly deliveredDrops: string | null
}

export interface MultisigDraft {
  readonly orderId: string
  readonly agreementHash: string
  readonly vault: string
  readonly beneficiary: string
  readonly amountDrops: string
  readonly resolutionMode: VaultResolutionMode
  readonly preparedTxJson: string
  readonly feeDrops: string
  readonly sequence: number
  readonly minLedger: number
  readonly lastLedger: number
  readonly sig1Signer: string | null
  readonly sig1Blob: string | null
  readonly sig2Signer: string | null
  readonly sig2Blob: string | null
  readonly submittedHash: string | null
}

export type NewAttemptInput = Omit<
  Attempt,
  'state' | 'ledgerIndex' | 'ledgerHash' | 'result' | 'deliveredDrops'
>

export class AttemptStore {
  private readonly db: DatabaseSync

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, 'escrow-attempts.sqlite')
    closeSync(openSync(path, 'a', 0o600))
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = FULL;

      CREATE TABLE IF NOT EXISTS attempts (
        hash TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        agreementHash TEXT NOT NULL,
        action TEXT NOT NULL,
        account TEXT NOT NULL,
        destination TEXT,
        amountDrops TEXT,
        blob TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        minLedger INTEGER NOT NULL,
        lastLedger INTEGER NOT NULL,
        broadcastUntil INTEGER,
        state TEXT NOT NULL DEFAULT 'pending',
        ledgerIndex INTEGER,
        ledgerHash TEXT,
        result TEXT,
        deliveredDrops TEXT
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS one_attempt_per_action
        ON attempts(orderId, action) WHERE state IN ('pending', 'validated');

      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_per_wallet
        ON attempts(account) WHERE state = 'pending';

      CREATE TABLE IF NOT EXISTS multisig_drafts (
        orderId TEXT PRIMARY KEY,
        agreementHash TEXT NOT NULL,
        vault TEXT NOT NULL,
        beneficiary TEXT NOT NULL,
        amountDrops TEXT NOT NULL,
        resolutionMode TEXT NOT NULL,
        preparedTxJson TEXT NOT NULL,
        feeDrops TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        minLedger INTEGER NOT NULL,
        lastLedger INTEGER NOT NULL,
        sig1Signer TEXT,
        sig1Blob TEXT,
        sig2Signer TEXT,
        sig2Blob TEXT,
        submittedHash TEXT
      ) STRICT;
    `)
  }

  active(orderId: string, action: PaymentAction): Attempt | undefined {
    return this.db
      .prepare(
        `
        SELECT * FROM attempts
        WHERE orderId = ? AND action = ? AND state IN ('pending', 'validated')
      `,
      )
      .get(orderId, action) as Attempt | undefined
  }

  pendingForAccount(account: string): Attempt | undefined {
    return this.db
      .prepare(`SELECT * FROM attempts WHERE account = ? AND state = 'pending'`)
      .get(account) as Attempt | undefined
  }

  listByOrder(orderId: string): Attempt[] {
    return this.db
      .prepare(`SELECT * FROM attempts WHERE orderId = ? ORDER BY rowid ASC`)
      .all(orderId) as unknown as Attempt[]
  }

  get(hash: string): Attempt {
    const row = this.db.prepare('SELECT * FROM attempts WHERE hash = ?').get(hash.toUpperCase())
    if (!row) throw new Error(`Unknown XRPL attempt: ${hash}`)
    return row as unknown as Attempt
  }

  record(attempt: NewAttemptInput): Attempt {
    const normalizedHash = attempt.hash.toUpperCase()
    const inserted = this.db
      .prepare(
        `
        INSERT INTO attempts (
          hash, orderId, agreementHash, action, account, destination, amountDrops,
          blob, sequence, minLedger, lastLedger, broadcastUntil
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `,
      )
      .run(
        normalizedHash,
        attempt.orderId,
        attempt.agreementHash,
        attempt.action,
        attempt.account,
        attempt.destination,
        attempt.amountDrops,
        attempt.blob,
        attempt.sequence,
        attempt.minLedger,
        attempt.lastLedger,
        attempt.broadcastUntil,
      )
    if (inserted.changes === 1) return this.get(normalizedHash)
    const existing = this.active(attempt.orderId, attempt.action)
    if (existing?.agreementHash === attempt.agreementHash) return existing
    throw new Error('An active attempt already exists for this order or wallet')
  }

  complete(
    hash: string,
    state: Exclude<AttemptState, 'pending'>,
    details: {
      readonly ledgerIndex: number | null
      readonly ledgerHash: string | null
      readonly result: string
      readonly deliveredDrops?: string | null
    },
  ): Attempt {
    const normalizedHash = hash.toUpperCase()
    this.db
      .prepare(
        `
        UPDATE attempts
        SET state = ?, ledgerIndex = ?, ledgerHash = ?, result = ?, deliveredDrops = ?, blob = ''
        WHERE hash = ? AND state = 'pending'
      `,
      )
      .run(
        state,
        details.ledgerIndex,
        details.ledgerHash,
        details.result,
        details.deliveredDrops ?? null,
        normalizedHash,
      )
    return this.get(normalizedHash)
  }

  getMultisigDraft(orderId: string): MultisigDraft | undefined {
    const row = this.db
      .prepare('SELECT * FROM multisig_drafts WHERE orderId = ?')
      .get(orderId)
    return row as unknown as MultisigDraft | undefined
  }

  saveMultisigDraft(
    draft: Omit<
      MultisigDraft,
      'sig1Signer' | 'sig1Blob' | 'sig2Signer' | 'sig2Blob' | 'submittedHash'
    >,
  ): MultisigDraft {
    this.db
      .prepare(
        `
        INSERT INTO multisig_drafts (
          orderId, agreementHash, vault, beneficiary, amountDrops, resolutionMode,
          preparedTxJson, feeDrops, sequence, minLedger, lastLedger,
          sig1Signer, sig1Blob, sig2Signer, sig2Blob, submittedHash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT(orderId) DO UPDATE SET
          agreementHash = excluded.agreementHash,
          vault = excluded.vault,
          beneficiary = excluded.beneficiary,
          amountDrops = excluded.amountDrops,
          resolutionMode = excluded.resolutionMode,
          preparedTxJson = excluded.preparedTxJson,
          feeDrops = excluded.feeDrops,
          sequence = excluded.sequence,
          minLedger = excluded.minLedger,
          lastLedger = excluded.lastLedger,
          sig1Signer = NULL,
          sig1Blob = NULL,
          sig2Signer = NULL,
          sig2Blob = NULL,
          submittedHash = NULL
        WHERE multisig_drafts.submittedHash IS NULL
      `,
      )
      .run(
        draft.orderId,
        draft.agreementHash,
        draft.vault,
        draft.beneficiary,
        draft.amountDrops,
        draft.resolutionMode,
        draft.preparedTxJson,
        draft.feeDrops,
        draft.sequence,
        draft.minLedger,
        draft.lastLedger,
      )
    const saved = this.getMultisigDraft(draft.orderId)
    if (!saved) throw new Error('Unable to save vault multisig draft')
    return saved
  }

  clearUnsubmittedMultisigDraft(orderId: string): void {
    this.db
      .prepare('DELETE FROM multisig_drafts WHERE orderId = ? AND submittedHash IS NULL')
      .run(orderId)
  }

  clearExpiredSubmittedMultisigDraft(orderId: string, expiredHash: string): void {
    this.db
      .prepare('DELETE FROM multisig_drafts WHERE orderId = ? AND submittedHash = ?')
      .run(orderId, expiredHash.toUpperCase())
  }

  saveFirstPartialSignature(orderId: string, signer: string, blob: string): MultisigDraft {
    this.db
      .prepare(
        `
        UPDATE multisig_drafts
        SET sig1Signer = ?, sig1Blob = ?
        WHERE orderId = ? AND sig1Signer IS NULL AND submittedHash IS NULL
      `,
      )
      .run(signer, blob, orderId)
    const updated = this.getMultisigDraft(orderId)
    if (!updated) throw new Error('Multisig draft not found')
    return updated
  }

  finalizeMultisigDraftSubmission(
    orderId: string,
    secondSigner: string,
    secondBlob: string,
    attempt: NewAttemptInput,
  ): Attempt {
    const normalizedHash = attempt.hash.toUpperCase()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.getMultisigDraft(orderId)
      if (!current) throw new Error('Multisig draft not found')
      if (current.submittedHash !== null) {
        this.db.exec('COMMIT')
        return this.get(current.submittedHash)
      }
      this.db
        .prepare(
          `
          UPDATE multisig_drafts
          SET sig2Signer = ?, sig2Blob = ?, submittedHash = ?
          WHERE orderId = ? AND submittedHash IS NULL
        `,
        )
        .run(secondSigner, secondBlob, normalizedHash, orderId)

      this.db
        .prepare(
          `
          INSERT INTO attempts (
            hash, orderId, agreementHash, action, account, destination, amountDrops,
            blob, sequence, minLedger, lastLedger, broadcastUntil
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          normalizedHash,
          attempt.orderId,
          attempt.agreementHash,
          attempt.action,
          attempt.account,
          attempt.destination,
          attempt.amountDrops,
          attempt.blob,
          attempt.sequence,
          attempt.minLedger,
          attempt.lastLedger,
          attempt.broadcastUntil,
        )
      this.db.exec('COMMIT')
      return this.get(normalizedHash)
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}
