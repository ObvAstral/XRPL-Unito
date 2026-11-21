import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Transaction } from 'xrpl'
import { readHash, readUint32, readValidatedLedger, recentSnapshot, record } from './pass.js'
import type { Fields, LedgerRequest, Snapshot } from './pass.js'
import { RpcError } from './rpc.js'

interface Receipt {
  txHash: string
  ledgerHash: string
  ledgerIndex: number
}

interface SignedAttempt {
  hash: string
  blob: string
  sequence: number
  firstLedger: number
  lastLedger: number
}

type Outcome =
  | { status: 'validated'; receipt: Receipt; meta: Fields }
  | { status: 'rejected'; txHash: string; code: string }
  | { status: 'pending'; txHash: string }

interface StoredAttempt {
  fingerprint: string
  attempt: SignedAttempt
  outcome: Outcome | null
}

interface Signer<T extends Transaction> {
  classicAddress: string
  sign: (tx: T) => { hash: string; tx_blob: string }
}

export class AttemptJournal {
  private database: DatabaseSync

  constructor(filename: string) {
    this.database = new DatabaseSync(filename)
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        account TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        signed TEXT NOT NULL,
        outcome TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wallet_in_flight ON attempts(account) WHERE outcome IS NULL;
    `)
  }

  read(id: string): StoredAttempt | undefined {
    const row = this.database.prepare('SELECT fingerprint, signed, outcome FROM attempts WHERE id = ?').get(id)
    if (!row) return undefined
    return {
      fingerprint: String(row.fingerprint),
      attempt: JSON.parse(String(row.signed)) as SignedAttempt,
      outcome: row.outcome === null ? null : JSON.parse(String(row.outcome)) as Outcome,
    }
  }

  hasPending(account: string): boolean {
    return this.database.prepare('SELECT 1 FROM attempts WHERE account = ? AND outcome IS NULL').get(account) !== undefined
  }

  save(id: string, account: string, fingerprint: string, attempt: SignedAttempt) {
    const existing = this.database.prepare(
      `INSERT INTO attempts(id, account, fingerprint, signed) VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    ).run(id, account, fingerprint, JSON.stringify(attempt))
    if (existing.changes === 0) {
      throw new Error('An in-flight attempt already exists for this wallet or command. Reconcile it before retrying.')
    }
  }

  finish(id: string, attempt: SignedAttempt, outcome: Outcome) {
    this.database.prepare(
      `UPDATE attempts SET outcome = ? WHERE id = ? AND signed = ? AND outcome IS NULL`,
    ).run(JSON.stringify(outcome), id, JSON.stringify(attempt))
  }

  clearRejected(id: string, attempt: SignedAttempt) {
    this.database.prepare(
      `DELETE FROM attempts WHERE id = ? AND signed = ? AND json_extract(outcome, '$.status') = 'rejected'`,
    ).run(id, JSON.stringify(attempt))
  }

  close() {
    this.database.close()
  }
}

async function finalize(rpc: LedgerRequest, attempt: SignedAttempt): Promise<Outcome> {
  const pending: Outcome = { status: 'pending', txHash: attempt.hash }
  let data: Fields
  try {
    data = await rpc('tx', {
      transaction: attempt.hash,
      min_ledger: attempt.firstLedger,
      max_ledger: attempt.lastLedger,
      binary: false,
    })
  } catch (error) {
    if (error instanceof RpcError && error.code === 'txnNotFound' && error.searchedAll) {
      if ((await readValidatedLedger(rpc)).index >= attempt.lastLedger) {
        return { status: 'rejected', txHash: attempt.hash, code: 'LAST_LEDGER_EXPIRED' }
      }
    }
    return pending
  }
  if (data.validated !== true || readHash(data.hash) !== attempt.hash) return pending

  const index = readUint32(data.ledger_index)
  if (index < attempt.firstLedger || index > attempt.lastLedger) {
    throw new Error('Validation ledger index outside attempt range.')
  }
  const meta = record(data.meta)
  const code = meta.TransactionResult
  if (typeof code !== 'string') return pending
  if (code !== 'tesSUCCESS') return { status: 'rejected', txHash: attempt.hash, code }

  const hash = data.ledger_hash === undefined
    ? (await readValidatedLedger(rpc, index)).hash
    : readHash(data.ledger_hash)
  return { status: 'validated', receipt: { txHash: attempt.hash, ledgerHash: hash, ledgerIndex: index }, meta }
}

async function prepare<T extends Transaction>(rpc: LedgerRequest, tx: T, snapshot: Snapshot, fee: string) {
  const account = await rpc('account_info', { account: tx.Account, ledger_hash: snapshot.hash })
  if (account.validated === false || readHash(account.ledger_hash) !== snapshot.hash) {
    throw new Error('Sequence unavailable on the selected snapshot.')
  }
  const details = record(account.account_data)
  if (details.Account !== tx.Account) throw new Error('Wallet account mismatch.')
  return {
    ...tx,
    Fee: fee,
    Sequence: readUint32(details.Sequence),
    LastLedgerSequence: readUint32(snapshot.index + 4),
  }
}

async function readFee(rpc: LedgerRequest): Promise<string> {
  const { open_ledger_fee } = record((await rpc('fee')).drops)
  if (typeof open_ledger_fee !== 'string' || !/^[1-9]\d{0,3}$/.test(open_ledger_fee) || Number(open_ledger_fee) > 1000) {
    throw new Error('Invalid Testnet fee or exceeds 1000 drops limit.')
  }
  return open_ledger_fee
}

interface RunOptions<T extends Transaction> {
  rpc: LedgerRequest
  journal: AttemptJournal
  signer: Signer<T>
  orderId: string
  tx: T
  /** Terms not included in the XRPL transaction, fixed for reconciliation. */
  context?: Fields
  preflight?: (snapshot: Snapshot) => Promise<void>
  confirm: (fee: string) => Promise<boolean>
  pause?: () => Promise<void>
}

export async function runTransaction<T extends Transaction>(options: RunOptions<T>): Promise<Outcome> {
  const { rpc, journal, signer, orderId, tx, preflight, confirm, pause = () => sleep(1800) } = options
  if (signer.classicAddress !== tx.Account) throw new Error('Wallet cannot sign for this role.')

  const id = JSON.stringify([signer.classicAddress, orderId, tx.TransactionType])
  const fingerprint = createHash('sha256').update(JSON.stringify([tx, options.context ?? null])).digest('hex')
  const saved = journal.read(id)
  if (saved && saved.fingerprint !== fingerprint && saved.outcome?.status !== 'rejected') {
    throw new Error('Terms changed relative to the attempt recorded for this command.')
  }
  if (saved?.outcome?.status === 'validated') return saved.outcome

  let attempt: SignedAttempt
  if (saved && !saved.outcome) {
    attempt = saved.attempt
  } else {
    if (journal.hasPending(signer.classicAddress)) {
      throw new Error('Wallet has a pending attempt. Repeat that command to reconcile it.')
    }
    const fee = await readFee(rpc)
    if (preflight) await preflight(await recentSnapshot(rpc))
    if (!(await confirm(fee))) throw new Error('Signature canceled.')
    const snapshot = await recentSnapshot(rpc)
    const prepared = await prepare(rpc, tx, snapshot, fee)
    if (preflight) await preflight(snapshot)
    const signed = signer.sign(prepared)
    attempt = {
      hash: readHash(signed.hash),
      blob: signed.tx_blob,
      sequence: prepared.Sequence,
      firstLedger: snapshot.index + 1,
      lastLedger: prepared.LastLedgerSequence,
    }
    if (saved) journal.clearRejected(id, saved.attempt)
    journal.save(id, signer.classicAddress, fingerprint, attempt)
  }

  let outcome = await finalize(rpc, attempt)
  if (outcome.status === 'pending') {
    const snapshot = await readValidatedLedger(rpc).catch(() => undefined)
    if (snapshot && snapshot.index < attempt.lastLedger) {
      // The response to submit can be lost even if the node received the transaction.
      await rpc('submit', { tx_blob: attempt.blob }).catch(() => undefined)
      for (let poll = 0; poll < 6 && outcome.status === 'pending'; poll++) {
        await pause()
        outcome = await finalize(rpc, attempt)
      }
    }
  }
  if (outcome.status !== 'pending') journal.finish(id, attempt, outcome)
  return outcome
}
