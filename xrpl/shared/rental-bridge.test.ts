import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RippledError, Wallet, decode, hashes, multisign, type Payment, type TransactionMetadata } from 'xrpl'
import { digestTerms, signOrder, signProposal, verifyRental, type RentalResource } from '../agreement/rental.js'
import { LocalSigner } from '../agreement/wallet.js'
import { EscrowLedger, type RpcClient } from '../escrow/ledger.js'
import {
  buildEscrowCreate,
  buildFeeRefund,
  buildVaultPayout,
  splitRentalAmount,
  toRippleTime,
  validateRentalOrder,
} from '../escrow/protocol.js'
import { RentalNfts } from '../nft/rental.js'
import type { Fields, LedgerRequest } from '../nft/pass.js'
import { rippleTime } from '../nft/pass.js'
import { RpcError } from '../nft/rpc.js'
import { AttemptJournal } from '../nft/transactions.js'
import { adaptLocalSigner, escrowStateForRevoke, rentalDepositState, toPaymentOrder } from './rental-bridge.js'
import { normalizeTestnetNode, testnetHttpUrl, testnetWsUrl } from './testnet-node.js'

const ledgerHash = 'A'.repeat(64)
const utc = (offsetSec: number) => new Date(Date.now() + offsetSec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
const hexId = (n: number) => n.toString(16).toUpperCase().padStart(64, '0')

test('alias del nodo Testnet condiviso fra setup e CLI', () => {
  assert.equal(normalizeTestnetNode(undefined), 'ripple')
  assert.equal(normalizeTestnetNode('xrpl-labs'), 'xrplLabs')
  assert.equal(normalizeTestnetNode('xrplLabs'), 'xrplLabs')
  assert.equal(testnetHttpUrl('xrplLabs'), 'https://testnet.xrpl-labs.com/')
  assert.equal(testnetWsUrl('ripple'), 'wss://s.altnet.rippletest.net:51233')
  assert.throws(() => normalizeTestnetNode('mainnet'), /xrpl-labs/)
})

test('riparto e scadenze dell’accordo coincidono con validateRentalOrder', () => {
  for (const [priceDrops, feeBps] of [
    ['10000000', 1000],
    ['10000001', 1000],
    ['99999999', 3333],
  ] as const) {
    const { rental } = signRental(priceDrops, feeBps, 'CD'.repeat(32))
    const payment = toPaymentOrder(rental, 'billboard')
    assert.deepEqual(splitRentalAmount(priceDrops, feeBps), {
      grossDrops: payment.grossDrops,
      feeBps: payment.feeBps,
      feeDrops: payment.feeDrops,
      netDrops: payment.netDrops,
    })
    const schedule = validateRentalOrder(payment)
    assert.equal(schedule.checkoutBy, rippleTime(rental.order.fundBy))
    assert.equal(schedule.startAt, rippleTime(rental.proposal.startsAt))
    assert.equal(schedule.finishAfter, rippleTime(rental.proposal.endsAt))
    assert.equal(toRippleTime(payment.endAt), schedule.finishAfter)
    assert.notEqual(payment.agreementHash, digestTerms(rental.proposal))
  }
})

test('pass, deposito e multifirma usano lo stesso accordo', async () => {
  const alice = new LocalSigner(Wallet.generate())
  const bob = new LocalSigner(Wallet.generate())
  const issuer = new LocalSigner(Wallet.generate())
  const vault = Wallet.generate().classicAddress
  const title = {
    resourceId: 'cad',
    issuer: issuer.classicAddress,
    alice: alice.classicAddress,
    validFrom: utc(-60),
    validTo: utc(3600),
  }
  const sim = nftSimulation()
  const journal = new AttemptJournal(':memory:')
  const nft = new RentalNfts(sim.rpc, journal, async () => {})
  const signing = (signer: LocalSigner) => ({ signer, confirm: async () => true })
  try {
    const titleOffer = await nft.issueTitle(title, signing(issuer))
    assert.equal(titleOffer.status, 'validated')
    if (titleOffer.status !== 'validated') return
    assert.equal((await nft.acceptTitle(title, titleOffer, signing(alice))).status, 'validated')

    const resource: RentalResource = { ...title, titleNftId: titleOffer.nftId, vault }
    const { bundle, rental, fundBy } = signRental('10000000', 1000, resource.titleNftId, {
      alice, bob, issuer, vault, title,
    })
    const pass = await nft.issuePass(bundle, resource, signing(issuer))
    assert.equal(pass.status, 'validated')
    if (pass.status !== 'validated') return
    const accepted = await nft.acceptPass(bundle, resource, pass, signing(bob))
    assert.equal(accepted.status, 'validated')
    if (accepted.status !== 'validated') return

    const passUri = sim.submitted
      .filter((tx) => tx.TransactionType === 'NFTokenMint')
      .map((tx) => Buffer.from(String(tx.URI), 'hex').toString('utf8'))
      .find((uri) => uri.startsWith('urn:affitti:v2:sha256:'))
    assert.equal(passUri, 'urn:affitti:v2:sha256:' + rental.agreementHash)

    const passOffer = sim.submitted.find(
      (tx) => tx.TransactionType === 'NFTokenCreateOffer' && tx.Destination === bob.classicAddress,
    )
    assert.ok(passOffer)
    assert.equal(passOffer.Amount, rental.feeDrops)
    assert.equal(passOffer.Expiration, rippleTime(fundBy))

    const payment = toPaymentOrder(rental, 'cad', {
      passNftId: accepted.nftId,
      offerId: accepted.offerId,
      acceptOfferHash: accepted.txHash,
    })
    assert.equal(payment.authority, issuer.classicAddress)
    assert.equal(payment.checkoutDeadline, fundBy)
    assert.equal(payment.startAt, rental.proposal.startsAt)
    assert.equal(payment.endAt, rental.proposal.endsAt)
    assert.equal(payment.grossDrops, '10000000')
    assert.equal(payment.feeDrops, '1000000')
    assert.equal(payment.netDrops, '9000000')

    const escrow = buildEscrowCreate(payment)
    assert.equal(escrow.Account, bob.classicAddress)
    assert.equal(escrow.Destination, vault)
    assert.equal(escrow.Amount, '9000000')
    assert.equal(escrow.FinishAfter, rippleTime(rental.proposal.endsAt))
    assert.equal(escrow.Condition, undefined)
    assert.equal(escrow.CancelAfter, undefined)
    assert.equal(passOffer.Expiration, toRippleTime(payment.checkoutDeadline))

    const recorded = sim.ledgerTx.get(accepted.txHash)
    assert.ok(recorded)
    const snapshot = { hash: ledgerHash, index: 1000, closeTime: rippleTime(utc(0)) }
    const ledger = new EscrowLedger(txClient(recorded.tx, recorded.meta, recorded.ledgerIndex))
    assert.equal(await ledger.verifyPassFeeCollected(payment, accepted.txHash, snapshot), true)

    const tampered = structuredClone(recorded.meta) as Fields
    const deleted = (tampered.AffectedNodes as Fields[])[0] as Fields
    const node = deleted.DeletedNode as Fields
    const fields = node.FinalFields as Fields
    fields.Amount = '1'
    const tamperedLedger = new EscrowLedger(txClient(recorded.tx, tampered, recorded.ledgerIndex))
    assert.equal(await tamperedLedger.verifyPassFeeCollected(payment, accepted.txHash, snapshot), false)

    const payoutFee = '30'
    const prepared: Payment = {
      ...buildVaultPayout(payment, 'ordinary'),
      Fee: payoutFee,
      Sequence: 8,
      LastLedgerSequence: 400,
    }
    const prompt = {
      orderId: payment.orderId,
      action: 'vault_payout' as const,
      feeDrops: payoutFee,
      summary: { vault, beneficiary: alice.classicAddress, amountDrops: payment.netDrops },
    }
    const aliceRole = adaptLocalSigner(alice)
    const bobRole = adaptLocalSigner(bob)
    assert.equal(aliceRole.address, alice.classicAddress)
    const combined = multisign([
      (await aliceRole.signForMultisig(prepared, prompt)).tx_blob,
      (await bobRole.signForMultisig(prepared, prompt)).tx_blob,
    ])
    const { Signers, ...unsigned } = decode(combined)
    assert.deepEqual(unsigned, prepared)
    assert.equal(Array.isArray(Signers) && Signers.length, 2)
    await assert.rejects(
      adaptLocalSigner(alice, async () => false).signForMultisig(prepared, prompt),
      /rifiutata/,
    )

    const refundFee = '12'
    const refundPrepared: Payment = {
      ...buildFeeRefund(payment),
      Fee: refundFee,
      Sequence: 3,
      LastLedgerSequence: 400,
    }
    const refundBlob = await adaptLocalSigner(issuer).signSingle(refundPrepared, {
      orderId: payment.orderId,
      action: 'fee_refund',
      feeDrops: refundFee,
      summary: {},
    })
    const refund = decode(refundBlob.tx_blob)
    assert.equal(refund.Account, payment.authority)
    assert.equal(refund.Destination, payment.bob)
    assert.equal(refund.Amount, rental.feeDrops)
    const memos = refund.Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    const memoHex = memos?.[0]?.Memo.MemoData
    assert.equal(typeof memoHex, 'string')
    assert.equal(
      Buffer.from(String(memoHex), 'hex').toString('utf8'),
      `${payment.orderId}:${rental.agreementHash}`,
    )

    assert.equal(escrowStateForRevoke('missing'), 'missing')
    assert.equal(escrowStateForRevoke('pending'), 'pending')
    assert.equal(escrowStateForRevoke('mismatch'), 'present')
    assert.equal(escrowStateForRevoke('locked'), 'present')
    assert.equal(escrowStateForRevoke('releasable'), 'present')
    assert.equal(escrowStateForRevoke('credited_to_vault'), 'present')

    const absent = new EscrowLedger(objectClient('actNotFound'))
    assert.equal(await rentalDepositState(absent, payment, snapshot), 'missing')
    assert.equal(await rentalDepositState(absent, payment, snapshot, true), 'pending')

    const active = new EscrowLedger(objectClient('escrow', payment))
    assert.equal(await rentalDepositState(active, payment, snapshot), 'present')

    const inflight = new EscrowLedger(txMissingClient())
    assert.equal(
      await rentalDepositState(inflight, { ...payment, createHash: 'F'.repeat(64) }, snapshot),
      'pending',
    )
  } finally {
    journal.close()
  }
})

function signRental(
  priceDrops: string,
  feeBps: number,
  titleNftId: string,
  parties = freshParties(),
) {
  const { alice, bob, issuer, vault, title } = parties
  const proposal = signProposal({
    protocol: 'xrpl-unito:rental-proposal',
    version: 2,
    network: 'testnet',
    splitRule: 'floor-bps',
    listingId: 'listing',
    revision: 1,
    resourceId: title.resourceId,
    titleNftId,
    issuer: title.issuer,
    alice: title.alice,
    startsAt: utc(120),
    endsAt: utc(240),
    priceDrops,
    feeBps,
  }, alice)
  const fundBy = utc(30)
  const order = {
    protocol: 'xrpl-unito:rental-order',
    version: 2,
    network: 'testnet',
    orderId: 'order-' + priceDrops,
    proposalHash: digestTerms(proposal.proposal),
    bob: bob.classicAddress,
    vault,
    fundBy,
  }
  const bundle = { ...proposal, acceptance: signOrder(proposal, order, bob) }
  const resource: RentalResource = { ...title, titleNftId, vault }
  return { bundle, resource, rental: verifyRental(bundle, resource), fundBy, ...parties }
}

function freshParties() {
  const alice = new LocalSigner(Wallet.generate())
  const bob = new LocalSigner(Wallet.generate())
  const issuer = new LocalSigner(Wallet.generate())
  const vault = Wallet.generate().classicAddress
  const title = {
    resourceId: 'cad',
    issuer: issuer.classicAddress,
    alice: alice.classicAddress,
    validFrom: utc(-60),
    validTo: utc(3600),
  }
  return { alice, bob, issuer, vault, title }
}

function nftSimulation() {
  let index = 100
  let closeTime = rippleTime(utc(0))
  const history = new Map<string, Fields>()
  const issued = new Map<string, { holder: string; token: Fields }>()
  const offers = new Map<string, Fields>()
  const submitted: Fields[] = []
  const ledgerTx = new Map<string, { tx: ReturnType<typeof decode>; meta: Fields; ledgerIndex: number }>()
  const rpc: LedgerRequest = async (command, params = {}) => {
    const snapshot = { ledger_hash: ledgerHash, ledger_index: index, validated: true }
    if (command === 'ledger') return { ...snapshot, ledger: { close_time: closeTime } }
    if (command === 'account_info') {
      return { ...snapshot, account_data: { Account: params.account, Sequence: index } }
    }
    if (command === 'account_nfts') {
      return {
        ...snapshot,
        account: params.account,
        account_nfts: [...issued.values()]
          .filter(({ holder }) => holder === params.account)
          .map(({ token }) => token),
      }
    }
    if (command === 'ledger_entry' && params.nft_offer) {
      return { ...snapshot, index: params.nft_offer, node: offers.get(String(params.nft_offer)) }
    }
    if (command === 'ledger_entry') {
      return {
        ...snapshot,
        index: params.index,
        node: { LedgerEntryType: 'Amendments', Amendments: [] },
      }
    }
    if (command === 'fee') return { drops: { open_ledger_fee: '12' } }
    if (command === 'tx') {
      const result = history.get(String(params.transaction))
      if (!result) throw new RpcError('txnNotFound', true)
      return result
    }
    if (command !== 'submit') throw new Error('RPC inatteso ' + command)

    const blob = String(params.tx_blob)
    const tx = decode(blob)
    submitted.push(tx)
    index += 1
    const txHash = hashes.hashSignedTx(blob).toUpperCase()
    const meta: Fields = { TransactionResult: 'tesSUCCESS', AffectedNodes: [] }
    const affected = meta.AffectedNodes as Fields[]
    let nftId = String(tx.NFTokenID ?? '')
    if (tx.TransactionType === 'NFTokenMint') {
      nftId = hexId(index)
      meta.nftoken_id = nftId
      issued.set(nftId, {
        holder: String(tx.Account),
        token: { NFTokenID: nftId, Issuer: tx.Account, Flags: tx.Flags ?? 0, URI: tx.URI },
      })
    }
    if (tx.TransactionType === 'NFTokenCreateOffer' || (tx.TransactionType === 'NFTokenMint' && tx.Destination)) {
      const offerId = hexId(index + 50)
      const offer = {
        Owner: tx.Account,
        NFTokenID: nftId,
        Amount: tx.Amount,
        Destination: tx.Destination,
        Flags: 1,
        Expiration: tx.Expiration,
      }
      affected.push({ CreatedNode: { LedgerEntryType: 'NFTokenOffer', LedgerIndex: offerId, NewFields: offer } })
      offers.set(offerId, { LedgerEntryType: 'NFTokenOffer', ...offer })
    }
    if (tx.TransactionType === 'NFTokenAcceptOffer') {
      const offerId = String(tx.NFTokenSellOffer)
      const stored = offers.get(offerId)
      if (!stored) throw new Error('Offerta assente')
      const { LedgerEntryType, ...offer } = stored
      offers.delete(offerId)
      issued.get(String(offer.NFTokenID))!.holder = String(tx.Account)
      affected.push({ DeletedNode: { LedgerEntryType, LedgerIndex: offerId, FinalFields: offer } })
      const balance = 10_000_000n
      affected.push({
        ModifiedNode: {
          LedgerEntryType: 'AccountRoot',
          PreviousFields: { Balance: String(balance) },
          FinalFields: { Account: offer.Owner, Balance: String(balance + BigInt(String(offer.Amount))) },
        },
      })
    }
    if (tx.TransactionType === 'NFTokenBurn') issued.delete(nftId)
    history.set(txHash, {
      hash: txHash,
      validated: true,
      ledger_hash: ledgerHash,
      ledger_index: index,
      meta,
    })
    ledgerTx.set(txHash, { tx, meta, ledgerIndex: index })
    return {}
  }
  return { rpc, submitted, ledgerTx }
}

function txClient(
  tx: ReturnType<typeof decode>,
  meta: Fields,
  ledgerIndex: number,
): RpcClient {
  return {
    async request(req) {
      if (req.command !== 'tx') throw new Error(req.command)
      return {
        result: {
          validated: true,
          hash: String(req.transaction).toUpperCase(),
          ledger_index: ledgerIndex,
          ledger_hash: ledgerHash,
          tx_json: { ...tx, date: rippleTime(utc(0)) },
          meta: meta as unknown as TransactionMetadata,
        },
      } as never
    },
    async autofill(transaction) {
      return transaction
    },
  }
}

function objectClient(kind: 'actNotFound' | 'escrow', payment?: ReturnType<typeof toPaymentOrder>): RpcClient {
  return {
    async request(req) {
      if (req.command !== 'account_objects') throw new Error(req.command)
      if (kind === 'actNotFound') throw new RippledError('actNotFound', { error: 'actNotFound' })
      if (!payment) throw new Error('ordine mancante')
      return {
        result: {
          validated: true,
          account_objects: [{
            LedgerEntryType: 'Escrow',
            Account: payment.bob,
            Destination: payment.vault,
            Amount: payment.netDrops,
            FinishAfter: buildEscrowCreate(payment).FinishAfter,
          }],
        },
      } as never
    },
    async autofill(transaction) {
      return transaction
    },
  }
}

function txMissingClient(): RpcClient {
  return {
    async request() {
      throw new RippledError('txnNotFound', { error: 'txnNotFound', searched_all: true })
    },
    async autofill(transaction) {
      return transaction
    },
  }
}
