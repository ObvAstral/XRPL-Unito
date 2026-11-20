import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AttemptJournal, runTransaction } from './transactions.js'
import { mintTransaction } from './pass.js'
import type { Fields, LedgerRequest, NftTransaction, Snapshot } from './pass.js'
import { RpcError } from './rpc.js'

const txHash = 'A'.repeat(64)
const ledgerHash = 'B'.repeat(64)
const account = 'rG88FVLjvYiQaGftSa1cKuE2qNx7aK5ivo'
const currentRippleTime = () => Math.floor(Date.now() / 1000) - 946_684_800
const tx = mintTransaction(account, 1, 'negative', 1)
const fixture = (resolveTx: () => Fields, submit: (fields: Fields) => Fields, index = 10) => {
  const rpc: LedgerRequest = async (command, fields = {}) => {
    if (command === 'fee') return { drops: { open_ledger_fee: '12' } }
    if (command === 'ledger') return {
      ledger_hash: ledgerHash, validated: true, ledger_index: index, ledger: { close_time: currentRippleTime() },
    }
    if (command === 'account_info') return {
      ledger_hash: ledgerHash, validated: true, account_data: { Account: account, Sequence: 2 },
    }
    if (command === 'tx') {
      assert.equal(fields.transaction, txHash)
      assert.equal(fields.min_ledger, 11)
      assert.equal(fields.max_ledger, 14)
      return resolveTx()
    }
    if (command === 'submit') return submit(fields)
    throw new Error(`Unexpected RPC: ${command}`)
  }
  return rpc
}

test('perde la risposta dopo submit, riapre il registro e riconcilia lo stesso hash', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'nft-attempt-'))
  const filename = join(folder, 'attempts.db')
  let journal = new AttemptJournal(filename)
  try {
    const events: string[] = []
    const preflight = async (snapshot: Snapshot) => {
      assert.equal(snapshot.hash, ledgerHash)
      events.push('preflight')
    }
    const params = {
      signer: { classicAddress: account, sign: (prepared: NftTransaction) => {
        events.push('sign')
        assert.deepEqual(prepared, { ...tx, Fee: '12', Sequence: 2, LastLedgerSequence: 14 })
        return { hash: txHash, tx_blob: 'CAFE' }
      } },
      orderId: 'demo-order-1', tx, preflight, pause: async () => {},
      confirm: async () => { events.push('confirm'); return true },
    }
    const rpcBefore = fixture(() => {
      throw new RpcError('txnNotFound')
    }, (fields) => {
      events.push('submit')
      const key = JSON.stringify([account, 'demo-order-1', 'NFTokenMint'])
      assert.equal(journal.read(key)?.attempt.hash, txHash)
      assert.deepEqual(fields, { tx_blob: 'CAFE' })
      throw new Error('connessione interrotta dopo la ricezione')
    })
    assert.deepEqual(await runTransaction({ ...params, rpc: rpcBefore, journal }), { status: 'pending', txHash })
    assert.deepEqual(events, ['preflight', 'confirm', 'preflight', 'sign', 'submit'])

    journal.close()
    journal = new AttemptJournal(filename)
    const meta = { TransactionResult: 'tesSUCCESS', nftoken_id: 'C'.repeat(64) }
    const rpcAfter = fixture(() => ({
      hash: txHash, validated: true, meta, ledger_index: 12, ledger_hash: ledgerHash,
    }), () => { throw new Error('Non serve un secondo invio') })
    const result = await runTransaction({ ...params, rpc: rpcAfter, journal })
    assert.deepEqual(result, {
      status: 'validated', receipt: { txHash, ledgerHash, ledgerIndex: 12 }, meta,
    })
    assert.deepEqual(events, ['preflight', 'confirm', 'preflight', 'sign', 'submit'])
  } finally {
    journal.close()
    rmSync(folder, { recursive: true, force: true })
  }
})

test('esito provvisorio e ricerche incomplete mantengono il tentativo in sospeso', async () => {
  const journal = new AttemptJournal(':memory:')
  try {
    const params = {
      signer: { classicAddress: account, sign: () => ({ hash: txHash, tx_blob: 'CAFE' }) },
      orderId: 'demo-order-1', tx, journal, pause: async () => {}, confirm: async () => true,
    }
    const provisional = fixture(() => ({
      hash: txHash, validated: false, meta: { TransactionResult: 'tesSUCCESS' },
    }), () => ({}))
    assert.equal((await runTransaction({ ...params, rpc: provisional })).status, 'pending')

    const noMoreSubmits = () => { throw new Error('Limite di ledger già raggiunto') }
    const missing = fixture(() => { throw new RpcError('txnNotFound') }, noMoreSubmits, 14)
    assert.equal((await runTransaction({ ...params, rpc: missing })).status, 'pending')
    const expired = fixture(() => { throw new RpcError('txnNotFound', true) }, noMoreSubmits, 14)
    assert.deepEqual(await runTransaction({ ...params, rpc: expired }), {
      status: 'rejected', txHash, code: 'LAST_LEDGER_EXPIRED',
    })
  } finally {
    journal.close()
  }
})
