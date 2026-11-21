import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import {
  RippledError,
  Wallet,
  decode,
  hashes,
  type Request,
  type SubmittableTransaction,
} from 'xrpl'
import type { RentalPaymentOrder } from '../shared/escrow-order.js'
import { createWalletSigner } from '../shared/signer.js'
import { AttemptStore } from './attempts.js'
import { EscrowLedger, type RpcClient } from './ledger.js'
import {
  LSF_DISABLE_MASTER,
  RIPPLE_EPOCH_SECONDS,
  canonicalSignerAddresses,
  splitRentalAmount,
  toRippleTime,
} from './protocol.js'
import { EscrowService } from './service.js'

const alice = Wallet.generate()
const bob = Wallet.generate()
const cadAuthority = Wallet.generate()
const operator = Wallet.generate()
const cadVault = Wallet.generate()

const utc = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().replace('.000Z', 'Z')

function buildOrderFixture(
  nowSec: number,
  overrides?: Partial<RentalPaymentOrder>,
): RentalPaymentOrder {
  const split = splitRentalAmount('10000000', 1000)
  return {
    orderId: 'order-cad-1',
    agreementHash: '1'.repeat(64),
    scenario: 'cad',
    network: 'testnet',
    alice: alice.classicAddress,
    bob: bob.classicAddress,
    authority: cadAuthority.classicAddress,
    vault: cadVault.classicAddress,
    grossDrops: split.grossDrops,
    feeBps: split.feeBps,
    feeDrops: split.feeDrops,
    netDrops: split.netDrops,
    checkoutDeadline: utc(nowSec + 60),
    startAt: utc(nowSec + 90),
    endAt: utc(nowSec + 180),
    passNftId: 'D'.repeat(64),
    offerId: 'E'.repeat(64),
    ...overrides,
  }
}

interface ActiveEscrowNode {
  objectId: string
  Account: string
  Destination: string
  Amount: string
  FinishAfter: number
  sequence: number
}

function createOrderTestRig(t: TestContext) {
  const stateDir = mkdtempSync(join(tmpdir(), 'ixh26-escrow-v2-'))
  let store = new AttemptStore(stateDir)
  t.after(() => {
    store.close()
    rmSync(stateDir, { recursive: true, force: true })
  })

  const nowSec = Math.floor(Date.now() / 1000)
  let ledgerIndex = 200
  let closeTime = nowSec - RIPPLE_EPOCH_SECONDS
  let ledgerValidated = true
  let completeHistory = true
  let autoValidateSubmits = true
  let failNextSubmit = false

  const sequences = new Map<string, number>([
    [alice.classicAddress, 1],
    [bob.classicAddress, 10],
    [cadAuthority.classicAddress, 20],
    [operator.classicAddress, 30],
    [cadVault.classicAddress, 40],
  ])
  const balances = new Map<string, bigint>([
    [alice.classicAddress, 50_000_000n],
    [bob.classicAddress, 50_000_000n],
    [cadAuthority.classicAddress, 50_000_000n],
    [operator.classicAddress, 50_000_000n],
    [cadVault.classicAddress, 20_000_000n],
  ])

  const vaultSigners = canonicalSignerAddresses([
    alice.classicAddress,
    bob.classicAddress,
    cadAuthority.classicAddress,
  ])

  const escrows = new Map<string, ActiveEscrowNode>()
  const transactions = new Map<string, Record<string, unknown>>()
  const bobHistory: Array<Record<string, unknown>> = []
  const submittedBlobs: string[] = []

  const ledgerHashAt = (idx: number) => idx.toString(16).padStart(64, 'B').toUpperCase()

  const executeBlobOnLedger = (blob: string) => {
    const hash = hashes.hashSignedTx(blob).toUpperCase()
    if (transactions.has(hash)) return hash
    const tx = decode(blob) as Record<string, unknown>
    const sender = String(tx.Account)
    const fee = BigInt(String(tx.Fee ?? '12'))

    balances.set(sender, (balances.get(sender) ?? 0n) - fee)
    sequences.set(sender, (sequences.get(sender) ?? 1) + 1)
    ledgerIndex += 1
    const lgrHash = ledgerHashAt(ledgerIndex)

    const affectedNodes: unknown[] = []
    let deliveredAmount: string | undefined

    if (tx.TransactionType === 'EscrowCreate') {
      const seq = Number(tx.Sequence)
      const objectId = hashes.hashEscrow(sender, seq).toUpperCase()
      const amount = String(tx.Amount)
      balances.set(sender, (balances.get(sender) ?? 0n) - BigInt(amount))
      escrows.set(objectId, {
        objectId,
        Account: sender,
        Destination: String(tx.Destination),
        Amount: amount,
        FinishAfter: Number(tx.FinishAfter),
        sequence: seq,
      })
    } else if (tx.TransactionType === 'EscrowFinish') {
      const owner = String(tx.Owner)
      const offerSeq = Number(tx.OfferSequence)
      const objectId = hashes.hashEscrow(owner, offerSeq).toUpperCase()
      const escrow = escrows.get(objectId)
      if (!escrow) throw new Error('Escrow missing in simulated EscrowFinish')
      escrows.delete(objectId)
      balances.set(
        escrow.Destination,
        (balances.get(escrow.Destination) ?? 0n) + BigInt(escrow.Amount),
      )
      affectedNodes.push({
        DeletedNode: {
          LedgerEntryType: 'Escrow',
          LedgerIndex: objectId,
          FinalFields: {
            Account: escrow.Account,
            Destination: escrow.Destination,
            Amount: escrow.Amount,
            FinishAfter: escrow.FinishAfter,
          },
        },
      })
    } else if (tx.TransactionType === 'Payment') {
      const dest = String(tx.Destination)
      const amount = String(tx.Amount)
      balances.set(sender, (balances.get(sender) ?? 0n) - BigInt(amount))
      balances.set(dest, (balances.get(dest) ?? 0n) + BigInt(amount))
      deliveredAmount = amount
    }

    const record = {
      hash,
      ledger_index: ledgerIndex,
      ledger_hash: lgrHash,
      validated: true,
      tx_json: { ...tx, date: closeTime },
      meta: {
        TransactionIndex: 0,
        TransactionResult: 'tesSUCCESS',
        AffectedNodes: affectedNodes,
        ...(deliveredAmount ? { delivered_amount: deliveredAmount } : {}),
      },
    }
    transactions.set(hash, record)
    if (tx.TransactionType === 'EscrowCreate' || tx.TransactionType === 'EscrowFinish') {
      bobHistory.push(record)
    }
    return hash
  }

  const recordPassAcceptance = (order: RentalPaymentOrder): string => {
    const acceptHash = 'F'.repeat(64)
    ledgerIndex += 1
    const prevAuthBal = balances.get(order.authority) ?? 50_000_000n
    const nextAuthBal = prevAuthBal + BigInt(order.feeDrops)
    balances.set(order.authority, nextAuthBal)
    balances.set(order.bob, (balances.get(order.bob) ?? 50_000_000n) - BigInt(order.feeDrops))

    transactions.set(acceptHash, {
      hash: acceptHash,
      ledger_index: ledgerIndex,
      ledger_hash: ledgerHashAt(ledgerIndex),
      validated: true,
      tx_json: {
        TransactionType: 'NFTokenAcceptOffer',
        Account: order.bob,
        NFTokenSellOffer: order.offerId,
        date: closeTime,
      },
      meta: {
        TransactionIndex: 0,
        TransactionResult: 'tesSUCCESS',
        AffectedNodes: [
          {
            DeletedNode: {
              LedgerEntryType: 'NFTokenOffer',
              LedgerIndex: order.offerId!.toUpperCase(),
              FinalFields: {
                Owner: order.authority,
                Destination: order.bob,
                Amount: order.feeDrops,
                NFTokenID: order.passNftId!.toUpperCase(),
              },
            },
          },
          {
            ModifiedNode: {
              LedgerEntryType: 'AccountRoot',
              LedgerIndex: '9'.repeat(64),
              PreviousFields: { Balance: prevAuthBal.toString() },
              FinalFields: { Account: order.authority, Balance: nextAuthBal.toString() },
            },
          },
        ],
      },
    })
    return acceptHash
  }

  const client: RpcClient = {
    async request(req: Request) {
      switch (req.command) {
        case 'server_state':
          return {
            result: {
              state: {
                validated_ledger: {
                  base_fee: 10,
                  close_time: closeTime,
                  hash: ledgerHashAt(ledgerIndex),
                  reserve_base: 1_000_000,
                  reserve_inc: 200_000,
                  seq: ledgerIndex,
                },
              },
            },
          } as never
        case 'ledger': {
          const idx = typeof req.ledger_index === 'number' ? req.ledger_index : ledgerIndex
          const expectedHash = ledgerHashAt(idx)
          const hash = typeof req.ledger_hash === 'string' ? req.ledger_hash.toUpperCase() : expectedHash
          return {
            result: {
              ledger_hash: hash,
              ledger_index: idx,
              validated: ledgerValidated,
              ledger: { close_time: closeTime },
            },
          } as never
        }
        case 'account_info': {
          const acct = req.account
          const bal = balances.get(acct)
          if (bal === undefined) {
            throw new RippledError('actNotFound', { error: 'actNotFound' })
          }
          const isVault = acct === cadVault.classicAddress
          return {
            result: {
              validated: true,
              ledger_index: ledgerIndex,
              account_data: {
                LedgerEntryType: 'AccountRoot',
                Account: acct,
                Balance: bal.toString(),
                Flags: isVault ? LSF_DISABLE_MASTER : 0,
                OwnerCount: isVault ? 1 : 0,
                Sequence: sequences.get(acct) ?? 1,
              },
              ...(req.signer_lists && isVault
                ? {
                    signer_lists: [
                      {
                        LedgerEntryType: 'SignerList',
                        Flags: 65536,
                        SignerListID: 0,
                        SignerQuorum: 2,
                        SignerEntries: vaultSigners.map((s) => ({
                          SignerEntry: { Account: s, SignerWeight: 1 },
                        })),
                      },
                    ],
                  }
                : {}),
            },
          } as never
        }
        case 'account_objects': {
          if (req.type === 'delegate') {
            return { result: { account: req.account, account_objects: [], validated: true } } as never
          }
          if (req.type === 'escrow') {
            const active = [...escrows.values()]
              .filter((e) => e.Account === req.account)
              .map((e) => ({
                LedgerEntryType: 'Escrow',
                Account: e.Account,
                Destination: e.Destination,
                Amount: e.Amount,
                FinishAfter: e.FinishAfter,
                index: e.objectId,
              }))
            return { result: { account: req.account, account_objects: active, validated: true } } as never
          }
          return { result: { account: req.account, account_objects: [], validated: true } } as never
        }
        case 'ledger_entry': {
          const escrowId = typeof req.escrow === 'string' ? req.escrow.toUpperCase() : ''
          const node = escrows.get(escrowId)
          if (!node) throw new RippledError('entryNotFound', { error: 'entryNotFound' })
          return {
            result: {
              index: escrowId,
              validated: true,
              ledger_current_index: ledgerIndex,
              node: {
                LedgerEntryType: 'Escrow',
                Account: node.Account,
                Destination: node.Destination,
                Amount: node.Amount,
                FinishAfter: node.FinishAfter,
              },
            },
          } as never
        }
        case 'account_tx':
          return { result: { transactions: bobHistory } } as never
        case 'tx': {
          const tx = transactions.get((req.transaction ?? '').toUpperCase())
          if (!tx) {
            throw new RippledError('txnNotFound', {
              error: 'txnNotFound',
              searched_all: completeHistory,
            })
          }
          return { result: tx } as never
        }
        case 'submit': {
          submittedBlobs.push(req.tx_blob)
          if (failNextSubmit) {
            failNextSubmit = false
            throw new Error('Simulated RPC transport timeout')
          }
          if (autoValidateSubmits) {
            executeBlobOnLedger(req.tx_blob)
          }
          return { result: { engine_result: 'tesSUCCESS' } } as never
        }
        default:
          throw new Error(`Unhandled RPC request in test: ${req.command}`)
      }
    },
    async autofill<T extends SubmittableTransaction>(tx: T, signersCount?: number): Promise<T> {
      const seq = sequences.get(tx.Account) ?? 1
      const fee = signersCount ? String(10 * (1 + signersCount)) : '12'
      return {
        ...tx,
        Sequence: seq,
        Fee: fee,
      }
    },
  }

  const ledger = new EscrowLedger(client, () => (closeTime + RIPPLE_EPOCH_SECONDS) * 1000)
  let serviceInstance = new EscrowService(ledger, store)
  return {
    nowSec,
    ledger,
    balances,
    submittedBlobs,
    get service() {
      return serviceInstance
    },
    get currentLedgerHash() {
      return ledgerHashAt(ledgerIndex)
    },
    advanceLedger(deltaIndex: number, newCloseTime?: number) {
      ledgerIndex += deltaIndex
      if (newCloseTime !== undefined) closeTime = newCloseTime
    },
    setCloseTime(rippleSec: number) {
      closeTime = rippleSec
    },
    setLedgerValidated(val: boolean) {
      ledgerValidated = val
    },
    setAutoValidateSubmits(val: boolean) {
      autoValidateSubmits = val
    },
    failNextSubmitOnce() {
      failNextSubmit = true
    },
    validateBlobManually(blob: string) {
      return executeBlobOnLedger(blob)
    },
    recordPassAcceptance,
    reopenService() {
      store.close()
      store = new AttemptStore(stateDir)
      serviceInstance = new EscrowService(ledger, store)
      return serviceInstance
    },
  }
}

test('computes integer 10 / 1 / 9 XRP split and validates calendar and address constraints', () => {
  const split = splitRentalAmount('10000000', 1000)
  assert.deepEqual(split, {
    grossDrops: '10000000',
    feeBps: 1000,
    feeDrops: '1000000',
    netDrops: '9000000',
  })
  assert.throws(() => splitRentalAmount('5', 1000), /at least 1 drop/)
  assert.throws(() => splitRentalAmount('10000000', 0), /feeBps/)
  assert.throws(() => splitRentalAmount('10000000', 10000), /feeBps/)
})

test('full 10 XRP CAD rental: 9 XRP deposit without Condition/CancelAfter, early release rejected, EscrowFinish, and 2-of-3 settlement to Alice', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec)
  const aliceBalanceBefore = rig.balances.get(alice.classicAddress)!
  const vaultBalanceBefore = rig.balances.get(cadVault.classicAddress)!

  // 1. Bob accepts the pass (1 XRP to authority) and deposits 9 XRP into the time-locked escrow toward the vault.
  rig.recordPassAcceptance(order)
  const depositRes = await rig.service.deposit(order, createWalletSigner(bob))
  assert.equal(depositRes.state, 'validated')
  assert.ok(depositRes.deposit)
  assert.equal(depositRes.deposit.amountDrops, '9000000')
  assert.equal(depositRes.deposit.destination, cadVault.classicAddress)

  const decodedDeposit = decode(rig.submittedBlobs[0]!) as Record<string, unknown>
  assert.equal(decodedDeposit.TransactionType, 'EscrowCreate')
  assert.equal(decodedDeposit.Condition, undefined)
  assert.equal(decodedDeposit.CancelAfter, undefined)
  assert.equal(decodedDeposit.FinishAfter, toRippleTime(order.endAt))

  // Until FinishAfter expires, the escrow is locked and early release is rejected.
  const lockedCheck = await rig.ledger.verifyEscrow(
    { ...order, createHash: depositRes.hash },
    rig.currentLedgerHash,
  )
  assert.equal(lockedCheck.state, 'locked')
  await assert.rejects(
    rig.service.releaseToVault(order, depositRes.hash, createWalletSigner(operator)),
    /not yet releasable/,
  )

  // 2. Usage period ends: escrow becomes releasable and operator submits EscrowFinish.
  rig.setCloseTime(toRippleTime(order.endAt) + 1)
  const releasableCheck = await rig.ledger.verifyEscrow(
    { ...order, createHash: depositRes.hash },
    rig.currentLedgerHash,
  )
  assert.equal(releasableCheck.state, 'releasable')

  const releaseRes = await rig.service.releaseToVault(
    order,
    depositRes.hash,
    createWalletSigner(operator),
  )
  assert.equal(releaseRes.state, 'validated')
  assert.equal(releaseRes.release?.amountDrops, '9000000')
  assert.equal(rig.balances.get(cadVault.classicAddress), vaultBalanceBefore + 9_000_000n)

  // Until the vault settles the net amount, the vault cannot yet be freed for other orders.
  assert.equal((await rig.service.reconcileOrder(order.orderId)).canReleaseVault, false)

  // 3. Asynchronous 2-of-3 settlement: a single signature keeps phase in awaiting_signatures.
  const draft = await rig.service.prepareVaultPayout(order, depositRes.hash, 'ordinary')
  assert.equal(draft.phase, 'awaiting_signatures')
  assert.equal(draft.feeDrops, '30') // 10 * (1 + 2 signers)

  const alicePartial = await createWalletSigner(alice).signForMultisig(draft.preparedTransaction, {
    orderId: order.orderId,
    action: 'vault_payout',
    feeDrops: draft.feeDrops,
    summary: {},
  })
  const afterFirstSig = await rig.service.addVaultSignature(order, alicePartial.tx_blob)
  assert.equal(afterFirstSig.phase, 'awaiting_signatures')
  assert.deepEqual(afterFirstSig.collectedSigners, [alice.classicAddress])
  assert.equal(rig.balances.get(alice.classicAddress), aliceBalanceBefore)

  // Resubmitting the same Alice signature does not satisfy quorum.
  const duplicateAlice = await rig.service.addVaultSignature(order, alicePartial.tx_blob)
  assert.equal(duplicateAlice.phase, 'awaiting_signatures')

  // Bob's second signature completes quorum, submits multisig Payment, and credits all 9 XRP to Alice.
  const bobPartial = await createWalletSigner(bob).signForMultisig(draft.preparedTransaction, {
    orderId: order.orderId,
    action: 'vault_payout',
    feeDrops: draft.feeDrops,
    summary: {},
  })
  const settled = await rig.service.addVaultSignature(order, bobPartial.tx_blob)
  assert.equal(settled.phase, 'validated')
  assert.equal(settled.payment.beneficiary, alice.classicAddress)
  assert.equal(settled.payment.deliveredDrops, '9000000')

  assert.equal(rig.balances.get(alice.classicAddress), aliceBalanceBefore + 9_000_000n)
  // The 30-drop network fee is paid entirely out of the vault's reserve margin.
  assert.equal(rig.balances.get(cadVault.classicAddress), vaultBalanceBefore - 30n)
  assert.equal((await rig.service.reconcileOrder(order.orderId)).canReleaseVault, true)
})

test('2-of-3 arbitration: Bob and Authority signatures return 9 XRP to Bob while leaving 1 XRP fee with authority', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec, {
    orderId: 'order-arbitration-1',
    agreementHash: '2'.repeat(64),
  })

  rig.recordPassAcceptance(order)
  const authorityBalanceAfterFee = rig.balances.get(cadAuthority.classicAddress)!
  const bobSigner = createWalletSigner(bob)
  const depositRes = await rig.service.deposit(order, bobSigner)
  const bobBalanceAfterDeposit = rig.balances.get(bob.classicAddress)!

  rig.setCloseTime(toRippleTime(order.endAt) + 2)
  await rig.service.releaseToVault(order, depositRes.hash, createWalletSigner(operator))

  const draft = await rig.service.prepareVaultPayout(order, depositRes.hash, 'arbitration_bob')
  assert.equal(draft.phase, 'awaiting_signatures')
  assert.equal(draft.beneficiary, bob.classicAddress)

  // Under arbitration_bob the allowed signers are [authority, bob]; an Alice signature is rejected.
  const unauthorizedAlice = await createWalletSigner(alice).signForMultisig(
    draft.preparedTransaction,
    { orderId: order.orderId, action: 'vault_payout', feeDrops: draft.feeDrops, summary: {} },
  )
  await assert.rejects(
    rig.service.addVaultSignature(order, unauthorizedAlice.tx_blob),
    /not authorized/,
  )

  const verdict = await rig.service.settleVault(
    order,
    depositRes.hash,
    'arbitration_bob',
    bobSigner,
    createWalletSigner(cadAuthority),
  )
  assert.equal(verdict.phase, 'validated')
  assert.equal(verdict.payment.beneficiary, bob.classicAddress)
  assert.equal(verdict.payment.deliveredDrops, '9000000')
  assert.equal(rig.balances.get(bob.classicAddress), bobBalanceAfterDeposit + 9_000_000n)
  // The authority retains the full 1 XRP fee collected on pass delivery.
  assert.equal(rig.balances.get(cadAuthority.classicAddress), authorityBalanceAfterFee)
})

test('interrupted checkout: blocks refunds on expired offers or pending deposits and executes a single fee refund when deposit is absent', async (t) => {
  const rig = createOrderTestRig(t)

  // Case A: Offer expired unaccepted -> no fee collected -> no refund allowed.
  const unacceptedOrder = buildOrderFixture(rig.nowSec, {
    orderId: 'order-expired-offer',
    agreementHash: '3'.repeat(64),
  })
  rig.setCloseTime(toRippleTime(unacceptedOrder.checkoutDeadline) + 5)
  await assert.rejects(
    rig.service.refundFee(unacceptedOrder, 'A'.repeat(64), createWalletSigner(cadAuthority)),
    /No verified fee collection/,
  )

  // Case B: Pass paid (1 XRP), deposit submission in flight -> refund blocked until deposit actually expires.
  const abandonedOrder = buildOrderFixture(rig.nowSec + 200, {
    orderId: 'order-abandoned-checkout',
    agreementHash: '4'.repeat(64),
  })
  const acceptHash = rig.recordPassAcceptance(abandonedOrder)

  rig.setAutoValidateSubmits(false)
  rig.failNextSubmitOnce()
  const pendingDeposit = await rig.service.deposit(abandonedOrder, createWalletSigner(bob))
  assert.equal(pendingDeposit.state, 'pending')

  rig.setCloseTime(toRippleTime(abandonedOrder.checkoutDeadline) + 10)
  // Until deposit LastLedgerSequence passes, attempt stays pending and refundFee refuses.
  await assert.rejects(
    rig.service.refundFee(abandonedOrder, acceptHash, createWalletSigner(cadAuthority)),
    /still verifying/,
  )

  // Once LastLedgerSequence passes with full history, deposit attempt is marked expired.
  rig.advanceLedger(20)
  rig.setAutoValidateSubmits(true)

  const bobBeforeRefund = rig.balances.get(bob.classicAddress)!
  const refund1 = await rig.service.refundFee(
    abandonedOrder,
    acceptHash,
    createWalletSigner(cadAuthority),
  )
  assert.equal(refund1.state, 'validated')
  assert.equal(refund1.payment?.deliveredDrops, '1000000')
  assert.equal(rig.balances.get(bob.classicAddress), bobBeforeRefund + 1_000_000n)

  // Double click or process restart never issues a second refund for the same fee.
  const reopened = rig.reopenService()
  const refund2 = await reopened.refundFee(
    abandonedOrder,
    acceptHash,
    createWalletSigner(cadAuthority, async () => {
      throw new Error('Must not ask for a second signature for the refund')
    }),
  )
  assert.equal(refund2.hash, refund1.hash)
  assert.equal(rig.balances.get(bob.classicAddress), bobBeforeRefund + 1_000_000n)
})

test('network resilience and concurrency: two concurrent deposits share one attempt and restart reconciles without re-signing', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec, {
    orderId: 'order-network-resilience',
    agreementHash: '5'.repeat(64),
  })

  rig.setAutoValidateSubmits(false)
  rig.failNextSubmitOnce()

  let signCalls = 0
  const countingBobSigner = createWalletSigner(bob, async () => {
    signCalls += 1
    return true
  })

  const [d1, d2] = await Promise.all([
    rig.service.deposit(order, countingBobSigner),
    rig.service.deposit(order, countingBobSigner),
  ])
  assert.equal(d1.hash, d2.hash)
  assert.equal(d1.state, 'pending')
  assert.equal(signCalls, 1)

  // Node receives and validates the blob after process restart: no second signature requested.
  const resumed = rig.reopenService()
  rig.setAutoValidateSubmits(true)
  const retried = await resumed.deposit(
    order,
    createWalletSigner(bob, async () => {
      throw new Error('Must not re-sign an already recorded attempt')
    }),
  )
  assert.equal(retried.hash, d1.hash)
  assert.equal(retried.state, 'validated')

  // If the ledger is unvalidated, verifyEscrow throws LedgerUnavailable (503 for Person C's backend).
  rig.setLedgerValidated(false)
  await assert.rejects(
    rig.ledger.verifyEscrow({ ...order, createHash: d1.hash }, rig.currentLedgerHash),
    /LEDGER_UNAVAILABLE/,
  )
})

test('2-of-3 multisig timeout, LastLedgerSequence expiry, and refund block when unrecorded active Escrow exists', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec, {
    orderId: 'order-multisig-timeout',
    agreementHash: '6'.repeat(64),
  })

  const acceptHash = rig.recordPassAcceptance(order)
  const depositRes = await rig.service.deposit(order, createWalletSigner(bob))

  // If Bob has an active matching Escrow object on ledger, refundFee blocks refund even if createHash is omitted on order.
  rig.setCloseTime(toRippleTime(order.checkoutDeadline) + 5)
  const freshInstanceDir = mkdtempSync(join(tmpdir(), 'ixh26-unrecorded-'))
  const freshStore = new AttemptStore(freshInstanceDir)
  t.after(() => {
    freshStore.close()
    rmSync(freshInstanceDir, { recursive: true, force: true })
  })
  const isolatedService = new EscrowService(rig.ledger, freshStore)
  await assert.rejects(
    isolatedService.refundFee(order, acceptHash, createWalletSigner(cadAuthority)),
    /active Escrow object belonging to Bob/,
  )

  // Release escrow at maturity and simulate timeout on multisig Payment submit.
  rig.setCloseTime(toRippleTime(order.endAt) + 5)
  await rig.service.releaseToVault(order, depositRes.hash, createWalletSigner(operator))

  rig.setAutoValidateSubmits(false)
  rig.failNextSubmitOnce()
  const pendingPayout = await rig.service.settleVault(
    order,
    depositRes.hash,
    'inadmissible_refund',
    createWalletSigner(alice),
    createWalletSigner(cadAuthority),
  )
  assert.equal(pendingPayout.phase, 'awaiting_ledger')

  // Until LastLedgerSequence expires, prepareVaultPayout stays awaiting_ledger without requesting fresh signatures.
  const stillPending = await rig.service.prepareVaultPayout(
    order,
    depositRes.hash,
    'inadmissible_refund',
  )
  assert.equal(stillPending.phase, 'awaiting_ledger')
  assert.equal(stillPending.attempt.hash, pendingPayout.attempt.hash)

  // After LastLedgerSequence passes without ledger validation, attempt expires and allows re-preparation.
  rig.advanceLedger(65)
  const expiredCheck = await rig.service.prepareVaultPayout(
    order,
    depositRes.hash,
    'inadmissible_refund',
  )
  assert.equal(expiredCheck.phase, 'expired')

  rig.setAutoValidateSubmits(true)
  const recovered = await rig.service.settleVault(
    order,
    depositRes.hash,
    'inadmissible_refund',
    createWalletSigner(alice),
    createWalletSigner(cadAuthority),
  )
  assert.equal(recovered.phase, 'validated')
  assert.equal(recovered.payment.beneficiary, bob.classicAddress)
  assert.equal(recovered.payment.deliveredDrops, '9000000')
})
