import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptTransaction, checkOffer, createPassVerifier, mintTransaction, offerTransaction, rippleTime } from './pass.js'
import type { Fields, LedgerRequest, PassOrder } from './pass.js'
import { createdOfferId, mintedNftId } from './metadata.js'

const hash = 'A'.repeat(64)
const id = 'B'.repeat(64)
const sameFilterId = 'C'.repeat(64)
const offerId = 'D'.repeat(64)
const utc = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
const order: PassOrder = {
  orderId: 'demo-order-1',
  aliceAddress: 'rG88FVLjvYiQaGftSa1cKuE2qNx7aK5ivo',
  bobAddress: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  nftId: id,
  offerId,
  offerExpiresAt: utc(60),
}

const page = (nfts: Fields[], fields: Fields = {}) => ({
  account: order.bobAddress, ledger_hash: hash, validated: true, account_nfts: nfts, ...fields,
})

test('verifyPass trova l’ID esatto nella seconda pagina sullo stesso snapshot', async () => {
  const calls: Fields[] = []
  const marker = { cursor: 'unused-by-client' }
  const verify = createPassVerifier(async (command, fields = {}) => {
    assert.equal(command, 'account_nfts')
    calls.push(fields)
    if (calls.length === 1) return page([{ NFTokenID: sameFilterId, URI: '1234' }], { marker })
    return page([{ NFTokenID: id, URI: '1234' }])
  })
  assert.equal(await verify(order, hash), 'present')
  assert.deepEqual(calls, [
    { account: order.bobAddress, ledger_hash: hash },
    { account: order.bobAddress, ledger_hash: hash, marker },
  ])
})

test('verifyPass dichiara assente un NFT omonimo con ID diverso solo a scansione completa', async () => {
  let calls = 0
  const verify = createPassVerifier(async () => {
    calls++
    return calls === 1 ? page([{ NFTokenID: sameFilterId, URI: '1234' }], { marker: 'next' }) : page([])
  })
  assert.equal(await verify(order, hash), 'absent')
  assert.equal(calls, 2)
})

test('verifyPass distingue RPC interrotto, snapshot incoerente e marker ciclico da pass assente', async () => {
  const ops: LedgerRequest[] = [
    async (_command, fields) => {
      if (fields?.marker) throw new Error('RPC disconnected')
      return page([], { marker: 'next' })
    },
    async () => page([{ NFTokenID: id }], { ledger_hash: offerId }),
    async () => page([], { marker: 'same' }),
  ]
  for (const rpc of ops) assert.equal(await createPassVerifier(rpc)(order, hash), 'unavailable')
})

test('verifyPass ripete la lettura sullo stesso hash quando un nodo è ancora indietro', async () => {
  const requests: unknown[] = []
  const verify = createPassVerifier(async (_command, fields) => {
    requests.push(fields?.ledger_hash)
    return page([{ NFTokenID: id }], { validated: requests.length > 1 })
  })
  assert.equal(await verify(order, hash), 'present')
  assert.deepEqual(requests, [hash, hash])
})

function offerFields(draft: PassOrder = order) {
  return {
    LedgerEntryType: 'NFTokenOffer',
    Flags: 1,
    Owner: draft.aliceAddress,
    NFTokenID: draft.nftId,
    Amount: '0',
    Destination: draft.bobAddress,
    Expiration: rippleTime(draft.offerExpiresAt),
  }
}

test('mint, offerta zero e accettazione producono i payload previsti', () => {
  const mint = mintTransaction(order.aliceAddress, 1, 'negative', 1)
  assert.equal(mint.TransactionType, 'NFTokenMint')
  assert.equal(mint.Flags, undefined)
  assert.equal(mint.TransferFee, undefined)
  assert.equal(Buffer.from(String(mint.URI), 'hex').toString(), 'urn:ixh26:filter:negative:1')
  assert.deepEqual(offerTransaction(order), {
    TransactionType: 'NFTokenCreateOffer', Account: order.aliceAddress, NFTokenID: id,
    Flags: 1, Amount: '0', Destination: order.bobAddress, Expiration: rippleTime(order.offerExpiresAt),
  })
  assert.deepEqual(acceptTransaction(order), {
    TransactionType: 'NFTokenAcceptOffer', Account: order.bobAddress, NFTokenSellOffer: offerId,
  })
  assert.throws(() => mintTransaction(order.aliceAddress, 1, 'negative', 2))
  assert.throws(() => rippleTime('2026-11-31T12:00:00Z'))
})

test('preflight legge l’offerta e la proprietà di Alice sullo stesso ledger', async () => {
  const calls: Fields[] = []
  const snapshot = { hash, index: 42, closeTime: rippleTime(utc(0)) }
  await checkOffer(async (command, fields = {}) => {
    calls.push({ command, ...fields })
    if (command === 'ledger_entry') return { ledger_hash: hash, index: offerId, node: offerFields() }
    return page([{ NFTokenID: id, Issuer: order.aliceAddress }], { account: order.aliceAddress })
  }, order, snapshot)
  assert.deepEqual(calls, [
    { command: 'ledger_entry', nft_offer: offerId, ledger_hash: hash, binary: false },
    { command: 'account_nfts', account: order.aliceAddress, ledger_hash: hash },
  ])
})

test('preflight rifiuta offerta alterata o scaduta, proprietario o emittente diverso', async () => {
  const snapshot = { hash, index: 42, closeTime: rippleTime(utc(0)) }
  for (const change of [
    { Amount: '1' }, { Flags: 0 }, { Destination: order.aliceAddress }, { Owner: order.bobAddress },
    { NFTokenID: sameFilterId }, { Expiration: rippleTime(utc(180)) },
  ]) {
    await assert.rejects(checkOffer(async () => ({
      ledger_hash: hash, index: offerId, node: { ...offerFields(), ...change },
    }), order, snapshot), /termini/)
  }
  await assert.rejects(checkOffer(async () => {
    throw new Error('Non serve interrogare il ledger per una scadenza già trascorsa')
  }, { ...order, offerExpiresAt: utc(-10) }, snapshot), /scaduta/)
  await assert.rejects(checkOffer(async (command) => {
    if (command === 'ledger_entry') return { ledger_hash: hash, index: offerId, node: offerFields() }
    return page([{ NFTokenID: id, Issuer: order.bobAddress }], { account: order.aliceAddress })
  }, order, snapshot), /emittente/)
})

test('estrae il token nuovo anche se il mint divide una pagina NFT', () => {
  const tokens = (...ids: string[]) => ({ NFTokens: ids.map((NFTokenID) => ({ NFToken: { NFTokenID } })) })
  assert.equal(mintedNftId({
    AffectedNodes: [
      { CreatedNode: { LedgerEntryType: 'NFTokenPage', NewFields: tokens(sameFilterId, id) } },
      { ModifiedNode: {
        LedgerEntryType: 'NFTokenPage', PreviousFields: tokens(hash, sameFilterId), FinalFields: tokens(hash),
      } },
    ],
  }), id)
  assert.equal(mintedNftId({ nftoken_id: id }), id)
  assert.throws(() => mintedNftId({
    AffectedNodes: [{ CreatedNode: { LedgerEntryType: 'NFTokenPage', NewFields: tokens(id, sameFilterId) } }],
  }), /un solo/)
})

test('ricava l’ID dell’offerta da CreatedNode e controlla la variante Clio', () => {
  const { Amount: _zero, ...newFields } = offerFields()
  const meta = {
    AffectedNodes: [
      { CreatedNode: { LedgerEntryType: 'DirectoryNode', LedgerIndex: hash } },
      { CreatedNode: { LedgerEntryType: 'NFTokenOffer', LedgerIndex: offerId, NewFields: newFields } },
    ],
  }
  assert.equal(createdOfferId(meta, offerTransaction(order)), offerId)
  assert.equal(createdOfferId({ ...meta, offer_id: offerId }, offerTransaction(order)), offerId)
  assert.throws(() => createdOfferId({ ...meta, offer_id: id }, offerTransaction(order)))
})
