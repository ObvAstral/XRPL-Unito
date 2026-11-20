import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { RippledError, Wallet, decode, hashes, type Client, type Request, type Transaction } from 'xrpl'
import { AttemptStore, EscrowLedger, EscrowService, prepareCondition } from '../escrow/index.js'
import { createExecutionLedgerCheck } from '../nft/execution.js'
import { assembleAgreement, signAgreement, toRippleTime, type Agreement, type AgreementTrust } from './agreement.js'
import { createEscrowAgreementVerifier, verifyEscrowOrder } from './escrow.js'

const ledgerHash = 'A'.repeat(64)
const nftId = 'B'.repeat(64)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const utc = (seconds: number) => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')

function signedFixture(cancelDelay = 300) {
  const alice = Wallet.generate()
  const bob = Wallet.generate()
  const oracle = Wallet.generate()
  const aliceKey = generateKeyPairSync('ed25519')
  const bobKey = generateKeyPairSync('ed25519')
  const { condition } = prepareCondition()
  const now = Math.floor(Date.now() / 1000)
  const closeTime = toRippleTime(utc(now))
  const regulationText = 'Il PNG verificato viene custodito dall’oracolo.'
  const regulation = { version: 1, sha256: hash(regulationText) }
  const agreement: Agreement = {
    protocol: 'xrpl-unito-agreement', version: 1, network: 'testnet', orderId: 'integration-order',
    nftId, offerId: 'C'.repeat(64), condition, regulation, priceDrops: 1000000, retentionSeconds: 86400,
    parties: { alice: { address: alice.address }, bob: { address: bob.address }, oracle: { address: oracle.address } },
    filter: { id: 'negative', version: 1 }, input: { id: 'demo-1', sha256: hash('demo image') },
    deadlines: {
      offerExpiresAt: utc(now + 45), fundBy: utc(now + 60), startBy: utc(now + 75),
      deliverBy: utc(now + 90), finishAfter: utc(now + 90), cancelAfter: utc(now + 90 + cancelDelay),
    },
  }
  const expected: AgreementTrust = {
    orderId: agreement.orderId, network: agreement.network, regulation, parties: {
      alice: { address: alice.address, publicKeyPem: aliceKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      bob: { address: bob.address, publicKeyPem: bobKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      oracle: { address: oracle.address },
    },
  }
  const bundle = assembleAgreement(agreement, regulationText,
    signAgreement(agreement, regulationText, expected, 'alice', aliceKey.privateKey),
    signAgreement(agreement, regulationText, expected, 'bob', bobKey.privateKey), expected)
  return { closeTime, bundle, expected, alice, bob, oracle }
}

test('finanzia solo un accordo verificato e registrato e legge pass e deposito sullo stesso snapshot', async (t) => {
  const { closeTime, bundle, expected, alice, bob, oracle } = signedFixture()
  const directory = mkdtempSync(join(tmpdir(), 'ixh26-integration-'))
  const store = new AttemptStore(directory)
  t.after(() => {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })

  let ownsPass = true
  let readFails = false
  let snapshotIndex = 100
  let snapshotClose = closeTime
  let refundHash: string | undefined
  const settled = new Map<string, { transaction: ReturnType<typeof decode>; index: number; date: number }>()
  const requests: Request[] = []
  const sent: string[] = []
  const sequence = 21
  const escrowId = hashes.hashEscrow(bob.address, sequence)
  const client = {
    async request(request: Request) {
      requests.push(request)
      switch (request.command) {
        case 'ledger':
          return { result: { ledger_hash: ledgerHash, ledger_index: snapshotIndex,
            validated: true, ledger: { close_time: snapshotClose } } }
        case 'account_nfts':
          if (readFails) throw new Error('RPC indisponibile')
          return { result: { account: bob.address, ledger_hash: ledgerHash, validated: true,
            account_nfts: ownsPass ? [{ NFTokenID: nftId }] : [] } }
        case 'tx': {
          const confirmation = settled.get(request.transaction ?? '')
          if (!confirmation) throw new RippledError('transaction not found', { error: 'txnNotFound' })
          return { result: {
            validated: true, ledger_index: confirmation.index, hash: request.transaction,
            tx_json: { ...confirmation.transaction, date: confirmation.date }, meta: { TransactionResult: 'tesSUCCESS' },
          } }
        }
        case 'ledger_entry': {
          if (refundHash) throw new RippledError('missing entry', { error: 'entryNotFound' })
          const deposit = settled.values().next().value
          assert(deposit)
          return { result: { validated: true, index: escrowId, ledger_hash: ledgerHash,
            node: { ...deposit.transaction, LedgerEntryType: 'Escrow' } } }
        }
        case 'account_tx': {
          const refund = refundHash ? settled.get(refundHash) : undefined
          return { result: { transactions: refund ? [{
            validated: true, hash: refundHash, ledger_index: refund.index, tx_json: refund.transaction,
            meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [{
              DeletedNode: { LedgerEntryType: 'Escrow', LedgerIndex: escrowId },
            }] },
          }] : [] } }
        }
        case 'submit':
          sent.push(request.tx_blob)
          return { result: { engine_result: 'tesSUCCESS' } }
        default:
          throw new Error(`Unexpected RPC: ${request.command}`)
      }
    },
    async autofill(transaction: Transaction) {
      return { ...transaction, Fee: '10', Sequence: sequence }
    },
  } as Pick<Client, 'request' | 'autofill'>
  const ledger = new EscrowLedger(client)
  const service = new EscrowService(ledger, store)
  const check = createExecutionLedgerCheck(client)

  let registration = { orderId: bundle.agreement.orderId, agreementHash: '0'.repeat(64) }
  let reads = 0
  let prompts = 0
  const verify = createEscrowAgreementVerifier(expected, async (orderId, oracleAddress) => {
    reads++
    assert.equal(orderId, expected.orderId)
    assert.equal(oracleAddress, oracle.address)
    return registration
  })
  const confirm = async () => { prompts++; return true }
  await assert.rejects(service.fund({ ...bundle, signatures: { alice: bundle.signatures.alice } }, verify, bob, confirm), /signatures/)
  assert.equal(reads, 0)
  await assert.rejects(service.fund(bundle, verify, bob, confirm), /AGREEMENT_NOT_READY/)
  assert.equal(prompts, 0)
  assert.equal(requests.length, 0)
  registration = { ...registration, agreementHash: bundle.agreementHash }

  const { order } = await verify(bundle)
  const passOrder = { ...order, nftId }
  assert.deepEqual(await check(passOrder), { status: 409, code: 'ESCROW_NOT_READY' })
  ownsPass = false
  assert.deepEqual(await check(passOrder), { status: 403, code: 'PASS_REQUIRED' })
  ownsPass = true
  readFails = true
  assert.deepEqual(await check(passOrder), { status: 503, code: 'LEDGER_UNAVAILABLE' })
  readFails = false

  const attempt = await service.fund(bundle, verify, bob, confirm)
  assert.equal(attempt.state, 'pending')
  assert.equal(prompts, 1)
  const blob = sent.at(-1)
  assert(blob)
  const transaction = decode(blob)
  assert.equal(transaction.TransactionType, 'EscrowCreate')
  assert.equal(transaction.Account, bob.address)
  assert.equal(transaction.Destination, alice.address)
  assert.equal(transaction.Amount, '1000000')
  assert.equal(transaction.Condition, bundle.agreement.condition)
  assert.equal(transaction.FinishAfter, toRippleTime(bundle.agreement.deadlines.finishAfter))
  assert.equal(transaction.CancelAfter, toRippleTime(bundle.agreement.deadlines.cancelAfter))

  settled.set(attempt.hash, { transaction, index: ++snapshotIndex, date: snapshotClose })
  assert.equal((await service.reconcile(attempt.hash)).state, 'validated')
  requests.length = 0
  const depositOrder = { ...passOrder, createHash: attempt.hash }
  const result = await check(depositOrder)
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') assert.equal(result.deposit.objectId, escrowId)
  const readsByHash = requests.filter((request) => request.command === 'account_nfts' || request.command === 'ledger_entry')
  assert.deepEqual(readsByHash.map((request) => [request.command, request.ledger_hash]),
    [['account_nfts', ledgerHash], ['ledger_entry', ledgerHash]])

  await assert.rejects(service.recover(depositOrder, bob, confirm), /non annullabile/)
  snapshotClose = toRippleTime(bundle.agreement.deadlines.cancelAfter) + 1
  t.mock.method(Date, 'now', () => (snapshotClose + 946_684_800) * 1000)
  snapshotIndex += 50
  assert.deepEqual(await check(depositOrder), { status: 409, code: 'ESCROW_NOT_READY' })

  const refund = await service.recover(depositOrder, bob, confirm)
  const refundBlob = sent.at(-1)
  assert(refundBlob)
  const transactionCancel = decode(refundBlob)
  assert.equal(transactionCancel.TransactionType, 'EscrowCancel')
  assert.equal(transactionCancel.Account, bob.address)
  assert.equal(transactionCancel.Owner, bob.address)
  assert.equal(transactionCancel.OfferSequence, sequence)
  refundHash = refund.hash
  settled.set(refund.hash, { transaction: transactionCancel, index: ++snapshotIndex, date: snapshotClose })
  assert.equal((await service.reconcile(refund.hash)).state, 'validated')
  assert.equal((await ledger.verifyEscrow(depositOrder, ledgerHash)).state, 'refunded')
})

test('rifiuta scadenze escrow incompatibili anche con due firme valide', () => {
  const { bundle, expected } = signedFixture(301)
  assert.throws(() => verifyEscrowOrder(bundle, expected), /scadenze firmate/)
})
