import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { RippledError, Wallet, decode, hashes, type Client, type Request } from 'xrpl'
import type { EscrowOrder } from '../shared/escrow-order.js'
import { AttemptStore } from './attempts.js'
import { EscrowLedger, type EscrowTransaction } from './ledger.js'
import { encodeFulfillment, escrowCreate, escrowTimes, prepareCondition, RIPPLE_EPOCH_SECONDS } from './protocol.js'
import { EscrowService } from './service.js'

const bob = Wallet.generate()
const alice = Wallet.generate()
const oracle = Wallet.generate()
const now = Math.floor(Date.now() / 1000)
const currentClose = now - RIPPLE_EPOCH_SECONDS
const utc = (seconds: number) => new Date(seconds * 1000).toISOString()
const ledgerHash = 'A'.repeat(64)
const createHash = 'B'.repeat(64)
const finalHash = 'C'.repeat(64)
const sequence = 12
const objectId = hashes.hashEscrow(bob.classicAddress, sequence)
const approve = async () => true

function fixture(fundBy: number, deliverBy: number) {
  const { condition, preimage } = prepareCondition()
  const order: EscrowOrder = {
    orderId: 'order-1', agreementHash: '1'.repeat(64), network: 'testnet',
    bob: bob.classicAddress, alice: alice.classicAddress, oracle: oracle.classicAddress,
    amountDrops: '1000000', condition, fundBy: utc(fundBy), deliverBy: utc(deliverBy),
  }
  return { order, preimage }
}

function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'ixh26-escrow-'))
  let store = new AttemptStore(directory)
  t.after(() => {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })

  const rpc = {
    index: 100,
    closeTime: currentClose,
    ledgerValidated: true,
    completeHistory: false,
    escrow: undefined as object | undefined,
    history: [] as unknown[],
    transactions: new Map<string, unknown>(),
    commands: [] as Request[],
    sent: [] as string[],
    submitTimeout: false,
  }
  const client = {
    async request(request: Request) {
      rpc.commands.push(request)
      switch (request.command) {
        case 'ledger':
          return { result: {
            ledger_hash: ledgerHash, ledger_index: rpc.index, validated: rpc.ledgerValidated,
            ledger: { close_time: rpc.closeTime },
          } }
        case 'tx': {
          const tx = rpc.transactions.get(request.transaction ?? '')
          if (tx) return { result: tx }
          throw new RippledError('transaction not found', { error: 'txnNotFound', searched_all: rpc.completeHistory })
        }
        case 'ledger_entry':
          if (!rpc.escrow) throw new RippledError('missing entry', { error: 'entryNotFound' })
          return { result: { node: rpc.escrow, index: objectId, validated: true } }
        case 'account_tx':
          return { result: { transactions: rpc.history } }
        case 'submit':
          rpc.sent.push(request.tx_blob)
          if (rpc.submitTimeout) throw new Error('RPC timeout')
          return { result: { engine_result: 'tesSUCCESS' } }
        default:
          throw new Error('Unexpected request')
      }
    },
    async autofill(transaction: EscrowTransaction) {
      return { ...transaction, Sequence: sequence, Fee: '370' }
    },
  }
  const ledger = new EscrowLedger(client as Pick<Client, 'request' | 'autofill'>)
  return {
    rpc, ledger, service: new EscrowService(ledger, store),
    reopen() {
      store.close()
      store = new AttemptStore(directory)
      return new EscrowService(ledger, store)
    },
  }
}

function addDeposit(rpc: ReturnType<typeof setup>['rpc'], order: EscrowOrder, date: number) {
  const transaction = escrowCreate(order)
  rpc.transactions.set(createHash, {
    hash: createHash, ledger_index: 80, validated: true,
    tx_json: { ...transaction, date, Sequence: sequence }, meta: { TransactionResult: 'tesSUCCESS' },
  })
  rpc.escrow = { ...transaction, LedgerEntryType: 'Escrow' }
  return { ...order, createHash }
}

test('codifica DER la preimage da 32 byte e rifiuta una condizione diversa', () => {
  const zeroFingerprint = '66687AADF862BD776C8FC18B8E9F8E20089714856EE233B3902A591D0D5F2925'
  assert.equal(encodeFulfillment(Buffer.alloc(32), 'A0258020' + zeroFingerprint + '810120'),
    'A0228020' + '00'.repeat(32))
  const { condition, preimage } = prepareCondition()
  assert.equal(encodeFulfillment(preimage, condition).length, 72)
  assert.throws(() => encodeFulfillment(preimage, prepareCondition().condition), /incompatibile/)
})

test('richiede accordo registrato, wallet di Bob e conferma prima della firma', async (t) => {
  const { order } = fixture(now + 90, now + 120)
  const { service, rpc } = setup(t)
  const valid = async () => ({ order, registeredAgreementHash: order.agreementHash })
  await assert.rejects(service.fund(order, async () => { throw new Error('firma assente') }, bob, approve), /firma assente/)
  await assert.rejects(service.fund(order, async () => ({ order, registeredAgreementHash: '' }), bob, approve),
    /AGREEMENT_NOT_READY/)
  await assert.rejects(service.fund(order, valid, alice, approve), /Firmatario/)
  await assert.rejects(service.fund(order, valid, bob, async () => false), /non confermata/)
  assert.deepEqual(rpc.sent, [])
})

test('riconcilia il deposito dopo un timeout e un riavvio senza firmare di nuovo', async (t) => {
  const { order } = fixture(now + 90, now + 120)
  const { service, rpc, reopen } = setup(t)
  const verify = async () => ({ order, registeredAgreementHash: order.agreementHash })
  rpc.submitTimeout = true
  const first = await service.fund(order, verify, bob, approve)
  assert.equal(first.state, 'pending')
  assert.equal(rpc.sent.length, 1)
  const sent = rpc.sent[0]!
  const tx = decode(sent)
  assert.equal(tx.Amount, '1000000')
  assert.equal(tx.Destination, order.alice)
  assert.equal(tx.LastLedgerSequence, 104)
  assert.equal(tx.CancelAfter, Number(tx.FinishAfter) + 300)

  const resumed = reopen()
  const retry = await resumed.fund(order, verify, bob, async () => { throw new Error('Seconda firma') })
  assert.equal(retry.hash, first.hash)
  assert.deepEqual(rpc.sent, [sent, sent])
  rpc.index = 104
  assert.equal((await resumed.reconcile(first.hash, true)).state, 'pending')
  assert.deepEqual(rpc.sent, [sent, sent])

  rpc.transactions.set(first.hash, {
    hash: first.hash, ledger_index: 103, validated: true, tx_json: tx, meta: { TransactionResult: 'tesSUCCESS' },
  })
  assert.equal((await resumed.reconcile(first.hash)).state, 'validated')
  assert.equal((await resumed.fund(order, verify, bob, async () => false)).hash, first.hash)
  assert.deepEqual(rpc.sent, [sent, sent])
})

test('libera un tentativo scaduto solo con la ricerca storica completa', async (t) => {
  const { order } = fixture(now + 90, now + 120)
  const { service, rpc } = setup(t)
  const attempt = await service.fund(order, async () => ({ order, registeredAgreementHash: order.agreementHash }),
    bob, approve)
  rpc.completeHistory = true
  rpc.index = 103
  assert.equal((await service.reconcile(attempt.hash)).state, 'pending')
  rpc.index = 104
  assert.equal((await service.reconcile(attempt.hash)).state, 'expired')
})

test('verifica deposito e scadenza sul ledger richiesto dall’API', async (t) => {
  const { order } = fixture(now - 50, now + 120)
  const { ledger, rpc } = setup(t)
  assert.deepEqual(await ledger.verifyEscrow(order, ledgerHash), { state: 'missing' })
  const deposit = addDeposit(rpc, order, currentClose - 51)
  const held = await ledger.verifyEscrow(deposit, ledgerHash)
  assert.equal(held.state, 'held')
  assert.ok(rpc.commands.some((req) => req.command === 'ledger_entry' && req.ledger_hash === ledgerHash))
  assert.equal((await ledger.verifyEscrow({ ...deposit, condition: prepareCondition().condition }, ledgerHash)).state,
    'mismatch')
  addDeposit(rpc, order, currentClose - 49)
  assert.equal((await ledger.verifyEscrow(deposit, ledgerHash)).state, 'mismatch')
  rpc.ledgerValidated = false
  await assert.rejects(ledger.verifyEscrow(deposit, ledgerHash), /LEDGER_UNAVAILABLE/)
})

test('incassa solo dopo consegna verificata legata al deposito', async (t) => {
  const { order, preimage } = fixture(now - 80, now - 5)
  const { service, rpc } = setup(t)
  const deposit = addDeposit(rpc, order, currentClose - 85)
  const evidence = { orderId: order.orderId, agreementHash: order.agreementHash, escrowId: objectId, preimage }

  await assert.rejects(service.finish(deposit, oracle, async () => undefined, approve), /Consegna verificata/)
  await assert.rejects(service.finish(deposit, oracle, async () => ({ ...evidence, escrowId: finalHash }), approve),
    /Consegna verificata/)
  await assert.rejects(service.finish(deposit, oracle, async () => ({ ...evidence, preimage: Buffer.alloc(32) }),
    approve), /incompatibile/)
  assert.equal((await service.finish(deposit, oracle, async () => evidence, approve)).state, 'pending')
  const decoded = decode(rpc.sent[0]!)
  assert.equal(decoded.TransactionType, 'EscrowFinish')
  assert.equal(decoded.Account, order.oracle)
  assert.equal(decoded.Fulfillment, encodeFulfillment(preimage, order.condition))
})

test('per il rimborso attende CancelAfter e richiede prova del consumo dell’oggetto', async (t) => {
  const { order } = fixture(now - 380, now - 300)
  const { service, ledger, rpc } = setup(t)
  const deposit = addDeposit(rpc, order, currentClose - 385)
  await assert.rejects(service.recover(deposit, bob, approve), /non annullabile/)
  rpc.closeTime = escrowTimes(order).cancelAfter + 1
  assert.equal((await service.recover(deposit, bob, approve)).state, 'pending')
  const tx = decode(rpc.sent[0]!)
  assert.equal(tx.TransactionType, 'EscrowCancel')
  assert.equal(tx.OfferSequence, sequence)

  rpc.escrow = undefined
  const entry = {
    hash: finalHash, ledger_index: 100, validated: true, tx_json: tx,
    meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [
      { DeletedNode: { LedgerEntryType: 'Escrow', LedgerIndex: objectId } },
    ] },
  }
  assert.equal((await ledger.verifyEscrow(deposit, ledgerHash)).state, 'pending')
  rpc.history = [{ ...entry, validated: false }]
  assert.equal((await ledger.verifyEscrow(deposit, ledgerHash)).state, 'pending')
  rpc.history = [entry]
  assert.equal((await ledger.verifyEscrow(deposit, ledgerHash)).state, 'refunded')
  rpc.history = [{ ...entry, tx_json: { ...tx, TransactionType: 'EscrowFinish' } }]
  assert.equal((await ledger.verifyEscrow(deposit, ledgerHash)).state, 'paid')
})

test('due richieste di deposito concorrenti condividono lo stesso tentativo persistito', async (t) => {
  const { order } = fixture(now + 90, now + 120)
  const { service, rpc } = setup(t)
  const verify = async () => ({ order, registeredAgreementHash: order.agreementHash })
  const [first, second] = await Promise.all([
    service.fund(order, verify, bob, approve),
    service.fund(order, verify, bob, approve),
  ])
  assert.equal(first.hash, second.hash)
  assert.ok(rpc.sent.length >= 1)
  assert.equal(new Set(rpc.sent).size, 1)
})
