import {
  Client, RippledError, hashes, isDeletedNode,
  type EscrowCreate, type EscrowFinish, type EscrowCancel,
  type LedgerEntry, type LedgerEntryJsonResponse, type LedgerEntryRequest,
  type Transaction, type TransactionMetadata,
} from 'xrpl'
import type { EscrowDepositOrder, EscrowOrder } from '../shared/escrow-order.js'
import { escrowCreate, escrowTimes, isHash, RIPPLE_EPOCH_SECONDS } from './protocol.js'

const TESTNET = {
  ripple: 'wss://s.altnet.rippletest.net:51233',
  xrplLabs: 'wss://testnet.xrpl-labs.com',
} as const

export type EscrowTransaction = EscrowCreate | EscrowFinish | EscrowCancel

export interface ValidatedLedger {
  readonly hash: string
  readonly index: number
  readonly closeTime: number
}

export interface ValidatedTransaction {
  readonly hash: string
  readonly ledgerIndex: number
  readonly closeTime?: number
  readonly transaction: Transaction
  readonly metadata: TransactionMetadata
}

export interface DepositReceipt {
  readonly hash: string
  readonly ledgerIndex: number
  readonly owner: string
  readonly sequence: number
  readonly objectId: string
}

export type EscrowStatus =
  | { state: 'missing' | 'mismatch' | 'pending' }
  | { state: 'held' | 'refundable'; deposit: DepositReceipt }
  | { state: 'paid' | 'refunded'; deposit: DepositReceipt; hash: string; ledgerIndex: number }

export class LedgerUnavailable extends Error {
  constructor() {
    super('LEDGER_UNAVAILABLE')
    this.name = 'LedgerUnavailable'
  }
}

function rippleError(error: unknown): { error?: string; searched_all?: boolean } {
  if (error instanceof RippledError && typeof error.data === 'object' && error.data !== null) {
    return error.data
  }
  return {}
}

function matchingTerms(
  actual: Pick<EscrowCreate, 'Account' | 'Destination' | 'Amount' | 'Condition' | 'FinishAfter' | 'CancelAfter'>,
  expected: EscrowCreate,
): boolean {
  return actual.Account === expected.Account && actual.Destination === expected.Destination
    && actual.Amount === expected.Amount && actual.Condition?.toUpperCase() === expected.Condition
    && actual.FinishAfter === expected.FinishAfter && actual.CancelAfter === expected.CancelAfter
}

type LedgerEscrow = LedgerEntry.Escrow

type Lookup = { state: 'found'; tx: ValidatedTransaction }
  | { state: 'unvalidated' }
  | { state: 'missing'; searchedAll: boolean }

export class EscrowLedger {
  constructor(private readonly client: Pick<Client, 'request' | 'autofill'>) {}

  async snapshot(ledgerHash?: string): Promise<ValidatedLedger> {
    try {
      const { result } = await this.client.request({
        command: 'ledger', api_version: 2,
        ...(ledgerHash ? { ledger_hash: ledgerHash } : { ledger_index: 'validated' }),
      })
      const { ledger_hash: hash, ledger_index: index, validated, ledger } = result
      const closeTime = ledger.close_time
      const age = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_SECONDS - closeTime
      if (validated !== true || !isHash(hash) || !Number.isInteger(index) || index < 1
        || !Number.isInteger(closeTime) || age > 30 || age < -10
        || (ledgerHash && hash !== ledgerHash.toUpperCase())) {
        throw new LedgerUnavailable()
      }
      return { hash, index, closeTime }
    } catch {
      throw new LedgerUnavailable()
    }
  }

  async lookup(hash: string, range?: { min: number; max: number }): Promise<Lookup> {
    try {
      const { result } = await this.client.request({
        command: 'tx', api_version: 2, binary: false, transaction: hash,
        ...(range && { min_ledger: range.min, max_ledger: range.max }),
      })
      if (result.validated !== true) return { state: 'unvalidated' }
      if (result.hash !== hash || typeof result.ledger_index !== 'number'
        || !result.meta || typeof result.meta === 'string'
        || typeof result.meta.TransactionResult !== 'string' || !result.tx_json) {
        throw new LedgerUnavailable()
      }
      const date = result.tx_json.date
      const closeTime = (typeof date === 'number' ? date : result.date)
        ?? (Date.parse(result.close_time_iso ?? '') / 1000 - RIPPLE_EPOCH_SECONDS)
      return {
        state: 'found',
        tx: { hash, ledgerIndex: result.ledger_index, closeTime, transaction: result.tx_json, metadata: result.meta },
      }
    } catch (error) {
      const rpc = rippleError(error)
      if (rpc.error === 'txnNotFound') return { state: 'missing', searchedAll: rpc.searched_all === true }
      throw new LedgerUnavailable()
    }
  }

  async verifyEscrow(order: EscrowOrder & { createHash?: string }, ledgerHash: string): Promise<EscrowStatus> {
    const snapshot = await this.snapshot(ledgerHash)
    if (order.createHash == null) return { state: 'missing' }
    return this.verifyAt({ ...order, createHash: order.createHash }, snapshot)
  }

  async verifyAt(order: EscrowDepositOrder, snapshot: ValidatedLedger): Promise<EscrowStatus> {
    const expected = escrowCreate(order)
    if (!isHash(order.createHash)) throw new Error('Hash EscrowCreate non valido')
    const creation = await this.lookup(order.createHash.toUpperCase())
    if (creation.state !== 'found' || creation.tx.ledgerIndex > snapshot.index) return { state: 'pending' }

    const { transaction, metadata, ledgerIndex, hash, closeTime } = creation.tx
    const { fundBy, cancelAfter } = escrowTimes(order)
    if (transaction.TransactionType !== 'EscrowCreate' || metadata.TransactionResult !== 'tesSUCCESS'
      || !matchingTerms(transaction, expected) || !transaction.Sequence
      || transaction.TicketSequence != null || transaction.Delegate != null) return { state: 'mismatch' }
    if (closeTime == null || !Number.isInteger(closeTime)) throw new LedgerUnavailable()
    if (closeTime > fundBy) return { state: 'mismatch' }

    const owner = order.bob
    const sequence = transaction.Sequence
    const objectId = hashes.hashEscrow(owner, sequence)
    const deposit = { hash, ledgerIndex, owner, sequence, objectId }
    const node = await this.escrowEntry(objectId, snapshot)
    if (node) {
      if (!matchingTerms(node, expected)) return { state: 'mismatch' }
      return { state: snapshot.closeTime > cancelAfter ? 'refundable' : 'held', deposit }
    }
    return this.findSettlement(deposit, snapshot)
  }

  private async escrowEntry(objectId: string, snapshot: ValidatedLedger): Promise<LedgerEscrow | undefined> {
    try {
      const { result } = await this.client.request<LedgerEntryRequest, 2, LedgerEntryJsonResponse<LedgerEscrow>>({
        command: 'ledger_entry', api_version: 2, ledger_hash: snapshot.hash, escrow: objectId,
      })
      if (result.validated !== true || result.index !== objectId || result.node?.LedgerEntryType !== 'Escrow') {
        throw new LedgerUnavailable()
      }
      return result.node
    } catch (error) {
      if (rippleError(error).error === 'entryNotFound') return undefined
      throw new LedgerUnavailable()
    }
  }

  private async findSettlement(deposit: DepositReceipt, snapshot: ValidatedLedger): Promise<EscrowStatus> {
    let marker: unknown
    try {
      do {
        const { result } = await this.client.request({
          command: 'account_tx', api_version: 2, account: deposit.owner, binary: false,
          ledger_index_min: deposit.ledgerIndex, ledger_index_max: snapshot.index, marker,
        })
        for (const item of result.transactions) {
          const tx = item.tx_json
          if (item.validated !== true || !isHash(item.hash) || !tx || !item.meta || typeof item.meta === 'string'
            || item.meta.TransactionResult !== 'tesSUCCESS' || item.ledger_index < deposit.ledgerIndex
            || item.ledger_index > snapshot.index
            || (tx.TransactionType !== 'EscrowFinish' && tx.TransactionType !== 'EscrowCancel')
            || tx.Owner !== deposit.owner || tx.OfferSequence !== deposit.sequence) continue
          const removed = item.meta.AffectedNodes.some((node) => isDeletedNode(node)
            && node.DeletedNode.LedgerEntryType === 'Escrow'
            && node.DeletedNode.LedgerIndex === deposit.objectId)
          if (removed) {
            return {
              state: tx.TransactionType === 'EscrowFinish' ? 'paid' : 'refunded',
              hash: item.hash, ledgerIndex: item.ledger_index, deposit,
            }
          }
        }
        marker = result.marker
      } while (marker != null)
    } catch {
      // La sparizione dell’oggetto non basta a stabilire l’esito.
    }
    return { state: 'pending' }
  }

  async fill(transaction: EscrowTransaction, snapshot: ValidatedLedger) {
    try {
      return await this.client.autofill({ ...transaction, LastLedgerSequence: snapshot.index + 4 })
    } catch {
      throw new LedgerUnavailable()
    }
  }

  async broadcast(blob: string): Promise<void> {
    try {
      await this.client.request({ command: 'submit', api_version: 2, tx_blob: blob })
    } catch {
      // Il submit non stabilisce l’esito, anche in caso di errore di trasporto.
    }
  }
}

export async function connectTestnet(node: keyof typeof TESTNET = 'ripple') {
  const endpoint = TESTNET[node]
  if (typeof endpoint !== 'string') throw new Error('Nodo Testnet sconosciuto')
  const client = new Client(endpoint, { timeout: 8_000, connectionTimeout: 8_000, maxFeeXRP: '0.01' })
  await client.connect()
  return { client, ledger: new EscrowLedger(client) }
}
