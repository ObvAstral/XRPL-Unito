import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decode, hashes, multisign, Wallet, type Payment } from 'xrpl'
import { digestTerms, signOrder, signProposal, verifyRental, type RentalResource } from '../agreement/rental.js'
import { LocalSigner } from '../agreement/wallet.js'
import { signLogin, WalletLogin } from '../agreement/wallet-login.js'
import type { Fields, LedgerRequest } from './pass.js'
import { recentSnapshot, rippleTime } from './pass.js'
import { RentalNfts, verifyRentalPass, verifyRentalTitle } from './rental.js'
import { RpcError } from './rpc.js'
import { AttemptJournal } from './transactions.js'

const ledgerHash = 'A'.repeat(64)
const amendment = 'EE3CF852F0506782D05E65D49E5DCC3D16D50898CD1B646BAE274863401CC3CE'
const account = () => new LocalSigner(Wallet.generate())
const hexId = (n: number) => n.toString(16).toUpperCase().padStart(64, '0')
const time = (offset: number) => new Date(Date.now() + offset * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

function simulation(combined: boolean) {
  let index = 100
  let closeTime = rippleTime(time(0))
  const history = new Map<string, Fields>()
  const issued = new Map<string, { holder: string; token: Fields }>()
  const offers = new Map<string, Fields>()
  const submitted: Fields[] = []
  const acted: { enabled: boolean; lostReply: boolean } = { enabled: true, lostReply: false }
  const rpc: LedgerRequest = async (command, params = {}) => {
    if (!acted.enabled) throw new Error('Rete indisponibile')
    const snapshot = { ledger_hash: ledgerHash, ledger_index: index, validated: true }
    if (command === 'ledger') return { ...snapshot, ledger: { close_time: closeTime } }
    if (command === 'account_info') return { ...snapshot, account_data: { Account: params.account, Sequence: index } }
    if (command === 'account_nfts') {
      return { ...snapshot, account: params.account, account_nfts: [...issued.values()]
        .filter(({ holder }) => holder === params.account).map(({ token }) => token) }
    }
    if (command === 'ledger_entry' && params.nft_offer) {
      return { ...snapshot, index: params.nft_offer, node: offers.get(String(params.nft_offer)) }
    }
    if (command === 'ledger_entry') {
      return { ...snapshot, index: params.index, node: { LedgerEntryType: 'Amendments', Amendments: combined ? [amendment] : [] } }
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
    index++
    const txHash = hashes.hashSignedTx(blob)
    const meta: Fields = { TransactionResult: 'tesSUCCESS', AffectedNodes: [] }
    const affected = meta.AffectedNodes as Fields[]
    let nftId = String(tx.NFTokenID)
    if (tx.TransactionType === 'NFTokenMint') {
      nftId = hexId(index)
      meta.nftoken_id = nftId
      issued.set(nftId, { holder: String(tx.Account), token: {
        NFTokenID: nftId, Issuer: tx.Account, Flags: tx.Flags ?? 0, URI: tx.URI,
      } })
    }
    if (tx.TransactionType === 'NFTokenCreateOffer' || (tx.TransactionType === 'NFTokenMint' && tx.Destination)) {
      const offerId = hexId(index + 50)
      const offer = {
        Owner: tx.Account, NFTokenID: nftId, Amount: tx.Amount, Destination: tx.Destination,
        Flags: 1, Expiration: tx.Expiration,
      }
      affected.push({ CreatedNode: { LedgerEntryType: 'NFTokenOffer', LedgerIndex: offerId, NewFields: offer } })
      offers.set(offerId, { LedgerEntryType: 'NFTokenOffer', ...offer })
    }
    if (tx.TransactionType === 'NFTokenAcceptOffer') {
      const offerId = String(tx.NFTokenSellOffer)
      const { LedgerEntryType, ...offer } = offers.get(offerId)!
      offers.delete(offerId)
      issued.get(String(offer.NFTokenID))!.holder = String(tx.Account)
      affected.push({ DeletedNode: { LedgerEntryType, LedgerIndex: offerId, FinalFields: offer } })
      const balance = 10_000_000n
      affected.push({ ModifiedNode: {
        LedgerEntryType: 'AccountRoot', PreviousFields: { Balance: String(balance) },
        FinalFields: { Account: offer.Owner, Balance: String(balance + BigInt(String(offer.Amount))) },
      } })
    }
    if (tx.TransactionType === 'NFTokenBurn') issued.delete(nftId)
    history.set(txHash, { hash: txHash, validated: true, ledger_hash: ledgerHash, ledger_index: index, meta })
    if (acted.lostReply) {
      acted.enabled = false
      throw new Error('Risposta submit persa')
    }
    return {}
  }
  return { rpc, submitted, acted, advance: (utc: string) => { closeTime = rippleTime(utc) + 1 } }
}

test('login vincolato al dominio, alla sessione e al consumo monouso', () => {
  const signer = account()
  let now = Date.now()
  const login = new WalletLogin(':memory:', 'localhost:3000', () => now)
  try {
    const challenge = login.issue('session-reference')
    const proof = signLogin(challenge, challenge.domain, signer, now)
    assert.throws(() => signLogin(challenge, 'other.example', signer, now))
    assert.throws(() => login.consume(challenge.id, 'other-session', proof))
    assert.throws(() => login.consume(challenge.id, challenge.sessionRef, { ...proof, publicKey: Wallet.generate().publicKey }))
    assert.deepEqual(login.consume(challenge.id, challenge.sessionRef, proof), { address: signer.classicAddress })
    assert.throws(() => login.consume(challenge.id, challenge.sessionRef, proof))
    const expired = login.issue(challenge.sessionRef)
    const expiredProof = signLogin(expired, expired.domain, signer, now)
    now = expired.expiresAt
    assert.throws(() => login.consume(expired.id, expired.sessionRef, expiredProof))
  } finally {
    login.close()
  }
})

test('Alice e Bob firmano lo stesso pagamento del vault senza inviarlo', () => {
  const alice = account()
  const bob = account()
  const payment: Payment = {
    TransactionType: 'Payment', Account: account().classicAddress, Destination: alice.classicAddress,
    Amount: '9000000', SigningPubKey: '', Fee: '30', Sequence: 123, LastLedgerSequence: 150,
  }
  const signed = multisign([alice.signPartial(payment).tx_blob, bob.signPartial(payment).tx_blob])
  const { Signers, ...prepared } = decode(signed)
  assert.deepEqual(prepared, payment)
  assert.ok(Array.isArray(Signers))
  assert.equal(Signers.length, 2)
  assert.throws(() => alice.sign(payment))
  assert.throws(() => alice.signPartial({ ...payment, Account: alice.classicAddress }))
  assert.throws(() => alice.signPartial({ ...payment, LastLedgerSequence: undefined }))
})

for (const combined of [false, true]) {
  test('titolo, accordo, fee, possesso e revoca con mint-offer ' + combined, async () => {
    const alice = account()
    const bob = account()
    const issuer = account()
    const vault = account().classicAddress
    const title = {
      resourceId: 'cad', issuer: issuer.classicAddress, alice: alice.classicAddress,
      validFrom: time(-60), validTo: time(3600),
    }
    const { rpc, submitted, acted, advance } = simulation(combined)
    const journal = new AttemptJournal(':memory:')
    const nft = new RentalNfts(rpc, journal, async () => {})
    const signing = (signer: LocalSigner) => ({ signer, confirm: async () => true })
    try {
      const titleOffer = await nft.issueTitle(title, signing(issuer))
      assert.equal(titleOffer.status, 'validated')
      if (titleOffer.status !== 'validated') return
      const titleAcceptance = await nft.acceptTitle(title, titleOffer, signing(alice))
      assert.equal(titleAcceptance.status, 'validated')

      const resource: RentalResource = { ...title, titleNftId: titleOffer.nftId, vault }
      const proposal = signProposal({
        protocol: 'xrpl-unito:rental-proposal', version: 2, network: 'testnet', splitRule: 'floor-bps',
        listingId: 'listing', revision: 1, resourceId: title.resourceId, titleNftId: resource.titleNftId,
        issuer: title.issuer, alice: title.alice, startsAt: time(120), endsAt: time(240), priceDrops: '10000000', feeBps: 1000,
      }, alice)
      const fundBy = time(30)
      const order = {
        protocol: 'xrpl-unito:rental-order', version: 2, network: 'testnet', orderId: 'order',
        proposalHash: digestTerms(proposal.proposal), bob: bob.classicAddress, vault, fundBy,
      }
      const bundle = { ...proposal, acceptance: signOrder(proposal, order, bob) }
      const rental = verifyRental(bundle, resource)
      assert.equal(rental.netDrops, '9000000')
      assert.throws(() => verifyRental({ ...bundle, proposal: { ...bundle.proposal, revision: 2 } }, resource))
      assert.throws(() => verifyRental(bundle, { ...resource, vault: account().classicAddress }))
      await assert.rejects(nft.issuePass(bundle, resource, signing(alice)))

      acted.lostReply = true
      assert.equal((await nft.issuePass(bundle, resource, signing(issuer))).status, 'pending')
      acted.enabled = true
      acted.lostReply = false
      const pass = await nft.issuePass(bundle, resource, signing(issuer))
      assert.equal(pass.status, 'validated')
      if (pass.status !== 'validated') return
      assert.equal(pass.mintReceipt.txHash === pass.offerReceipt.txHash, combined)
      assert.equal(submitted.filter((tx) => tx.TransactionType === 'NFTokenMint').length, 2)
      assert.equal(await verifyRentalPass(rpc, bundle, resource, pass.nftId, ledgerHash), 'absent')
      await assert.rejects(nft.acceptPass(bundle, resource, { ...pass, nftId: titleOffer.nftId }, signing(bob)))
      const receipt = await nft.acceptPass(bundle, resource, pass, signing(bob))
      assert.equal(receipt.status, 'validated')
      assert.equal(receipt.agreementHash, rental.agreementHash)
      if (receipt.status === 'validated') assert.equal(receipt.feeDrops, '1000000')
      assert.deepEqual(await nft.acceptPass(bundle, resource, pass, signing(bob)), receipt)
      assert.equal(await verifyRentalPass(rpc, bundle, resource, pass.nftId, ledgerHash), 'present')
      assert.equal(await verifyRentalTitle(rpc, resource, ledgerHash), 'present')
      assert.equal(await verifyRentalPass(rpc, bundle, resource, titleOffer.nftId, ledgerHash), 'absent')
      acted.enabled = false
      assert.equal(await verifyRentalPass(rpc, bundle, resource, pass.nftId, ledgerHash), 'unavailable')
      acted.enabled = true

      const abandoned = { ...proposal, acceptance: signOrder(proposal, { ...order, orderId: 'abandoned' }, bob) }
      const unaccepted = await nft.issuePass(abandoned, resource, signing(issuer))
      if (unaccepted.status !== 'validated') assert.fail('Attesa offerta validata')
      const missing = async () => 'missing' as const
      await assert.rejects(nft.revokePass(bundle, resource, pass.nftId, signing(issuer), missing))
      advance(fundBy)
      const snapshot = await recentSnapshot(rpc)
      assert.ok(snapshot.closeTime > rippleTime(fundBy))
      await assert.rejects(nft.revokePass(bundle, resource, pass.nftId, signing(issuer), async () => 'pending'))
      const revoked = await nft.revokePass(bundle, resource, pass.nftId, signing(issuer), missing)
      assert.equal(revoked.status, 'validated')
      if (revoked.status === 'validated') assert.equal(revoked.feeRefundDue, true)
      assert.equal(submitted.at(-1)?.Owner, bob.classicAddress)
      assert.equal(await verifyRentalPass(rpc, bundle, resource, pass.nftId, ledgerHash), 'absent')
      assert.deepEqual(await nft.revokePass(bundle, resource, pass.nftId, signing(issuer), missing), revoked)

      const unpaid = await nft.revokePass(abandoned, resource, unaccepted.nftId, signing(issuer), missing)
      assert.equal(unpaid.status, 'validated')
      if (unpaid.status === 'validated') assert.equal(unpaid.feeRefundDue, false)
      assert.equal(submitted.at(-1)?.Owner, undefined)
    } finally {
      journal.close()
    }
  })
}
