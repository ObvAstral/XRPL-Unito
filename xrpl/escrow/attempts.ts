import { closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type EscrowAction = 'fund' | 'finish' | 'recover'
type AttemptState = 'pending' | 'validated' | 'failed' | 'expired'

export interface Attempt {
  orderId: string
  agreementHash: string
  action: EscrowAction
  account: string
  hash: string
  blob: string
  sequence: number
  minLedger: number
  lastLedger: number
  broadcastUntil: number | null
  state: AttemptState
  ledgerIndex: number | null
  result: string | null
}

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
        blob TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        minLedger INTEGER NOT NULL,
        lastLedger INTEGER NOT NULL,
        broadcastUntil INTEGER,
        state TEXT NOT NULL DEFAULT 'pending',
        ledgerIndex INTEGER,
        result TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_attempt_per_action
        ON attempts(orderId, action) WHERE state IN ('pending', 'validated');
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_per_wallet
        ON attempts(account) WHERE state = 'pending';
    `)
  }

  active(orderId: string, action: EscrowAction): Attempt | undefined {
    return this.db.prepare(`
      SELECT * FROM attempts
      WHERE orderId = ? AND action = ? AND state IN ('pending', 'validated')
    `).get(orderId, action) as Attempt | undefined
  }

  get(hash: string): Attempt {
    const row = this.db.prepare('SELECT * FROM attempts WHERE hash = ?').get(hash)
    if (!row) throw new Error('Tentativo escrow inesistente')
    return row as unknown as Attempt
  }

  record(attempt: Omit<Attempt, 'state' | 'ledgerIndex' | 'result'>): Attempt {
    const inserted = this.db.prepare(`
      INSERT INTO attempts (hash, orderId, agreementHash, action, account, blob,
                            sequence, minLedger, lastLedger, broadcastUntil)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
    `).run(attempt.hash, attempt.orderId, attempt.agreementHash, attempt.action,
      attempt.account, attempt.blob, attempt.sequence, attempt.minLedger, attempt.lastLedger,
      attempt.broadcastUntil)
    if (inserted.changes === 1) return this.get(attempt.hash)
    const existing = this.active(attempt.orderId, attempt.action)
    if (existing?.agreementHash === attempt.agreementHash) return existing
    throw new Error('Esiste già un tentativo per l’ordine o per il wallet')
  }

  complete(hash: string, state: Exclude<AttemptState, 'pending'>, index: number | null, result: string) {
    this.db.prepare(`
      UPDATE attempts SET state = ?, ledgerIndex = ?, result = ?, blob = ''
      WHERE hash = ? AND state = 'pending'
    `).run(state, index, result, hash)
    return this.get(hash)
  }

  close(): void {
    this.db.close()
  }
}
