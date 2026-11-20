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
      if (!escrow) throw new Error('Escrow inesistente in EscrowFinish simulato')
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
            throw new Error('Timeout di trasporto RPC simulato')
          }
          if (autoValidateSubmits) {
            executeBlobOnLedger(req.tx_blob)
          }
          return { result: { engine_result: 'tesSUCCESS' } } as never
        }
        default:
          throw new Error(`Richiesta RPC non gestita nel test: ${req.command}`)
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

test('calcola il riparto intero 10 / 1 / 9 XRP e valida i vincoli di calendario e indirizzi', () => {
  const split = splitRentalAmount('10000000', 1000)
  assert.deepEqual(split, {
    grossDrops: '10000000',
    feeBps: 1000,
    feeDrops: '1000000',
    netDrops: '9000000',
  })
  assert.throws(() => splitRentalAmount('5', 1000), /almeno 1 drop/)
  assert.throws(() => splitRentalAmount('10000000', 0), /feeBps/)
  assert.throws(() => splitRentalAmount('10000000', 10000), /feeBps/)
})

test('affitto CAD completo da 10 XRP: deposito 9 XRP senza Condition/CancelAfter, rifiuto sblocco anticipato, EscrowFinish e liquidazione 2-su-3 ad Alice', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec)
  const aliceBalanceBefore = rig.balances.get(alice.classicAddress)!
  const vaultBalanceBefore = rig.balances.get(cadVault.classicAddress)!

  // 1. Bob accetta il pass (1 XRP all'ente) e deposita i 9 XRP nell'escrow temporale verso il vault.
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

  // Finche' non scade FinishAfter, l'escrow e' locked e lo sblocco anticipato viene respinto.
  const lockedCheck = await rig.ledger.verifyEscrow(
    { ...order, createHash: depositRes.hash },
    rig.currentLedgerHash,
  )
  assert.equal(lockedCheck.state, 'locked')
  await assert.rejects(
    rig.service.releaseToVault(order, depositRes.hash, createWalletSigner(operator)),
    /non ancora sbloccabile/,
  )

  // 2. Scade il periodo d'uso: l'escrow diventa releasable e l'account operativo invia EscrowFinish.
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

  // Finche' il vault non liquida il netto, il vault non puo' ancora essere liberato per altri ordini.
  assert.equal((await rig.service.reconcileOrder(order.orderId)).canReleaseVault, false)

  // 3. Liquidazione 2 su 3 asincrona: una sola firma lascia lo stato in awaiting_signatures.
  const draft = await rig.service.prepareVaultPayout(order, depositRes.hash, 'ordinary')
  assert.equal(draft.phase, 'awaiting_signatures')
  assert.equal(draft.feeDrops, '30') // 10 * (1 + 2 firmatari)

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

  // Un reinvio della stessa firma di Alice non completa il quorum.
  const duplicateAlice = await rig.service.addVaultSignature(order, alicePartial.tx_blob)
  assert.equal(duplicateAlice.phase, 'awaiting_signatures')

  // La seconda firma di Bob completa il quorum, invia il Payment multifirma e accredita tutti i 9 XRP ad Alice.
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
  // Il costo di rete di 30 drops e' interamente a carico della provvista del vault.
  assert.equal(rig.balances.get(cadVault.classicAddress), vaultBalanceBefore - 30n)
  assert.equal((await rig.service.reconcileOrder(order.orderId)).canReleaseVault, true)
})

test('arbitrato 2-su-3: firme di Bob ed Ente restituiscono i 9 XRP a Bob lasciando la fee di 1 XRP all’ente', async (t) => {
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

  // Nel verdetto arbitration_bob i firmatari autorizzati sono [authority, bob]; una firma di Alice viene rifiutata.
  const unauthorizedAlice = await createWalletSigner(alice).signForMultisig(
    draft.preparedTransaction,
    { orderId: order.orderId, action: 'vault_payout', feeDrops: draft.feeDrops, summary: {} },
  )
  await assert.rejects(
    rig.service.addVaultSignature(order, unauthorizedAlice.tx_blob),
    /non autorizzato/,
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
  // L'ente mantiene per intero la fee da 1 XRP incassata alla consegna del pass.
  assert.equal(rig.balances.get(cadAuthority.classicAddress), authorityBalanceAfterFee)
})

test('checkout interrotto: blocca rimborsi su offerte scadute o depositi pendenti ed esegue un solo rimborso fee quando il deposito manca', async (t) => {
  const rig = createOrderTestRig(t)

  // Caso A: Offerta scaduta senza accettazione -> nessun incasso fee -> nessun rimborso ammesso.
  const unacceptedOrder = buildOrderFixture(rig.nowSec, {
    orderId: 'order-expired-offer',
    agreementHash: '3'.repeat(64),
  })
  rig.setCloseTime(toRippleTime(unacceptedOrder.checkoutDeadline) + 5)
  await assert.rejects(
    rig.service.refundFee(unacceptedOrder, 'A'.repeat(64), createWalletSigner(cadAuthority)),
    /Nessun incasso fee verificato/,
  )

  // Caso B: Pass pagato (1 XRP), invio deposito in sospeso -> rimborso bloccato finche' il deposito non scade davvero.
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
  // Finche' LastLedgerSequence del deposito non e' superato, il tentativo resta pending e refundFee si rifiuta.
  await assert.rejects(
    rig.service.refundFee(abandonedOrder, acceptHash, createWalletSigner(cadAuthority)),
    /ancora in verifica/,
  )

  // Superato LastLedgerSequence con cronologia completa, il tentativo di deposito viene marcato expired.
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

  // Doppio click o riavvio del processo non invia mai un secondo rimborso della stessa fee.
  const reopened = rig.reopenService()
  const refund2 = await reopened.refundFee(
    abandonedOrder,
    acceptHash,
    createWalletSigner(cadAuthority, async () => {
      throw new Error('Non deve chiedere una seconda firma per il rimborso')
    }),
  )
  assert.equal(refund2.hash, refund1.hash)
  assert.equal(rig.balances.get(bob.classicAddress), bobBeforeRefund + 1_000_000n)
})

test('resilienza rete e concorrenza: due depositi simultanei condividono il tentativo e un riavvio riconcilia senza rifirmare', async (t) => {
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

  // Il nodo riceve e valida il blob dopo il riavvio del processo: nessuna seconda firma richiesta.
  const resumed = rig.reopenService()
  rig.setAutoValidateSubmits(true)
  const retried = await resumed.deposit(
    order,
    createWalletSigner(bob, async () => {
      throw new Error('Non deve rifirmare un tentativo gia’ registrato')
    }),
  )
  assert.equal(retried.hash, d1.hash)
  assert.equal(retried.state, 'validated')

  // Se il ledger non e' validato, verifyEscrow solleva LedgerUnavailable (503 per il backend di C).
  rig.setLedgerValidated(false)
  await assert.rejects(
    rig.ledger.verifyEscrow({ ...order, createHash: d1.hash }, rig.currentLedgerHash),
    /LEDGER_UNAVAILABLE/,
  )
})

test('timeout sulla multifirma 2-su-3, scadenza LastLedgerSequence e blocco rimborso se esiste Escrow attivo non registrato', async (t) => {
  const rig = createOrderTestRig(t)
  const order = buildOrderFixture(rig.nowSec, {
    orderId: 'order-multisig-timeout',
    agreementHash: '6'.repeat(64),
  })

  const acceptHash = rig.recordPassAcceptance(order)
  const depositRes = await rig.service.deposit(order, createWalletSigner(bob))

  // Se sul ledger esiste l'oggetto Escrow attivo di Bob, refundFee blocca il rimborso anche omettendo createHash sull'ordine.
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
    /oggetto Escrow attivo di Bob/,
  )

  // Sblocca l'escrow a maturazione e simula un timeout su submit del Payment multifirma.
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

  // Finche' non scade LastLedgerSequence, prepareVaultPayout mantiene awaiting_ledger senza chiedere nuove firme.
  const stillPending = await rig.service.prepareVaultPayout(
    order,
    depositRes.hash,
    'inadmissible_refund',
  )
  assert.equal(stillPending.phase, 'awaiting_ledger')
  assert.equal(stillPending.attempt.hash, pendingPayout.attempt.hash)

  // Superato LastLedgerSequence senza validazione sul ledger, il tentativo diventa expired e permette una nuova preparazione.
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
