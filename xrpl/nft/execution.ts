import type { Client } from 'xrpl'
import { EscrowLedger, LedgerUnavailable, type DepositReceipt, type EscrowOrder } from '../escrow/index.js'
import { createPassVerifier } from './pass.js'

type ExecutionOrder = EscrowOrder & { nftId: string; createHash?: string }
type ExecutionLedgerResult =
  | { status: 'ready'; ledgerHash: string; deposit: DepositReceipt }
  | { status: 403; code: 'PASS_REQUIRED' }
  | { status: 409; code: 'ESCROW_NOT_READY' }
  | { status: 503; code: 'LEDGER_UNAVAILABLE' }

/** Bind both checks to one connection. After failover, run both checks again. */
export function createExecutionLedgerCheck(client: Pick<Client, 'request' | 'autofill'>) {
  const ledger = new EscrowLedger(client)
  const verifyPass = createPassVerifier(async (_command, fields) => {
    const { result } = await client.request({
      command: 'account_nfts', api_version: 2, account: String(fields?.account),
      ledger_hash: String(fields?.ledger_hash), marker: fields?.marker,
    })
    return { ...result }
  })
  return async function checkExecutionLedger(order: ExecutionOrder): Promise<ExecutionLedgerResult> {
    try {
      const snapshot = await ledger.snapshot()
      const pass = await verifyPass({ bobAddress: order.bob, nftId: order.nftId }, snapshot.hash)
      if (pass === 'unavailable') return { status: 503, code: 'LEDGER_UNAVAILABLE' }
      if (pass === 'absent') return { status: 403, code: 'PASS_REQUIRED' }
      if (order.createHash === undefined) return { status: 409, code: 'ESCROW_NOT_READY' }
      const escrow = await ledger.verifyAt({ ...order, createHash: order.createHash }, snapshot)
      if (escrow.state !== 'held') return { status: 409, code: 'ESCROW_NOT_READY' }
      return { status: 'ready', ledgerHash: snapshot.hash, deposit: escrow.deposit }
    } catch (error) {
      if (error instanceof LedgerUnavailable) return { status: 503, code: 'LEDGER_UNAVAILABLE' }
      throw error
    }
  }
}
