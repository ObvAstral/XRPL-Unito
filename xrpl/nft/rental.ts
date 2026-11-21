import { decode, type NFTokenAcceptOffer, type NFTokenBurn, type NFTokenCreateOffer, type NFTokenMint } from 'xrpl'
import { digestTerms, readTitle, verifyRental, type RentalBundle, type RentalResource, type TitleTerms } from '../agreement/rental.js'
import type { LocalSigner } from '../agreement/wallet.js'
import { createdOfferId, mintedNftId } from './metadata.js'
import { checkOfferWindow, findOwnedNft, readAtSnapshot, readHash, recentSnapshot, record, rippleTime } from './pass.js'
import type { Fields, LedgerRequest, PassStatus, Snapshot } from './pass.js'
import { RpcError } from './rpc.js'
import { AttemptJournal, runTransaction } from './transactions.js'

const amendmentsId = '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4'
const mintOfferId = 'EE3CF852F0506782D05E65D49E5DCC3D16D50898CD1B646BAE274863401CC3CE'
type RentalTx = NFTokenMint | NFTokenCreateOffer | NFTokenAcceptOffer | NFTokenBurn
type TitledRental = ReturnType<typeof verifyRental>
type Asset = { issuer: string; recipient: string; uri: string; flags: number; amount: string; expiresAt?: string }
export type RentalSigning = {
  signer: LocalSigner
  confirm: (request: RentalTx & { Fee: string }, terms: Fields) => Promise<boolean>
}
export type OfferIds = { nftId: string; offerId: string }

function validatedRpc(rpc: LedgerRequest): LedgerRequest {
  return async (command, fields) => {
    const result = await rpc(command, fields)
    if (fields?.ledger_hash && typeof result.validated !== 'boolean') throw new Error('Unvalidated ledger.')
    return result
  }
}

function hexUri(uri: string) {
  return Buffer.from(uri, 'utf8').toString('hex').toUpperCase()
}

function titleAsset(title: TitleTerms): Asset {
  return {
    issuer: title.issuer, recipient: title.alice, flags: 0, amount: '0',
    uri: hexUri('urn:affitti:v2:title:sha256:' + digestTerms(title)),
  }
}

function passAsset(rental: TitledRental): Asset {
  return {
    issuer: rental.proposal.issuer, recipient: rental.order.bob, flags: 1, amount: rental.feeDrops,
    uri: hexUri('urn:affitti:v2:sha256:' + rental.agreementHash), expiresAt: rental.order.fundBy,
  }
}

function offerFields(asset: Asset) {
  return {
    Amount: asset.amount, Destination: asset.recipient,
    ...(asset.expiresAt && { Expiration: rippleTime(asset.expiresAt) }),
  }
}

function sale(asset: Asset, nftId: string): NFTokenCreateOffer {
  return {
    TransactionType: 'NFTokenCreateOffer', Account: asset.issuer, NFTokenID: nftId, Flags: 1, ...offerFields(asset),
  }
}

async function owns(rpc: LedgerRequest, asset: Asset, holder: string, nftId: string, hash: string): Promise<boolean> {
  try {
    const nft = await findOwnedNft(rpc, holder, readHash(nftId), hash)
    return nft?.Issuer === asset.issuer && nft.URI === asset.uri && nft.Flags === asset.flags
  } catch (error) {
    if (error instanceof RpcError && error.code === 'actNotFound') return false
    throw error
  }
}

async function verifyOwnership(rpc: LedgerRequest, asset: Asset, nftId: string, hash: string): Promise<PassStatus> {
  try {
    return await owns(validatedRpc(rpc), asset, asset.recipient, nftId, readHash(hash)) ? 'present' : 'absent'
  } catch {
    return 'unavailable'
  }
}

export function verifyRentalTitle(rpc: LedgerRequest, resource: RentalResource, ledgerHash: string) {
  const { titleNftId, vault: _vault, ...title } = resource
  return verifyOwnership(rpc, titleAsset(readTitle(title)), titleNftId, ledgerHash)
}

export function verifyRentalPass(
  rpc: LedgerRequest, bundle: RentalBundle, resource: RentalResource, nftId: string, ledgerHash: string,
) {
  const asset = passAsset(verifyRental(bundle, resource))
  return verifyOwnership(rpc, asset, nftId, ledgerHash)
}

function matchesOffer(offer: Fields, asset: Asset, nftId: string) {
  const expiration = asset.expiresAt && rippleTime(asset.expiresAt)
  return offer.Flags === 1 && offer.Owner === asset.issuer && offer.NFTokenID === nftId
    && offer.Destination === asset.recipient && (offer.Amount ?? '0') === asset.amount
    && offer.Expiration === expiration
}

function verifySaleMetadata(meta: Fields, asset: Asset, ids: OfferIds) {
  if (!Array.isArray(meta.AffectedNodes)) throw new Error('Missing acceptance metadata.')
  let removedOffer = false
  let credited = asset.amount === '0'
  for (const entry of meta.AffectedNodes) {
    const node = record(entry)
    if (node.DeletedNode) {
      const deleted = record(node.DeletedNode)
      if (deleted.LedgerEntryType === 'NFTokenOffer' && deleted.LedgerIndex === ids.offerId) {
        removedOffer = matchesOffer(record(deleted.FinalFields), asset, ids.nftId)
      }
    }
    if (!credited && node.ModifiedNode) {
      const modified = record(node.ModifiedNode)
      if (modified.LedgerEntryType !== 'AccountRoot') continue
      const fields = record(modified.FinalFields)
      if (fields.Account !== asset.issuer) continue
      const previous = record(modified.PreviousFields)
      if (typeof previous.Balance === 'string' && typeof fields.Balance === 'string') {
        credited = BigInt(fields.Balance) - BigInt(previous.Balance) === BigInt(asset.amount)
      }
    }
  }
  if (!removedOffer || !credited) throw new Error('Validated metadata does not confirm the expected offer and fee.')
}

export class RentalNfts {
  private readonly rpc: LedgerRequest

  constructor(rpc: LedgerRequest, private readonly journal: AttemptJournal, private readonly pause?: () => Promise<void>) {
    this.rpc = validatedRpc(rpc)
  }

  async mintOfferEnabled(ledgerHash?: string): Promise<boolean> {
    const hash = ledgerHash ? readHash(ledgerHash) : (await recentSnapshot(this.rpc)).hash
    const result = await readAtSnapshot(this.rpc, 'ledger_entry', { index: amendmentsId }, hash)
    const node = record(result.node)
    if (readHash(result.index ?? node.index) !== amendmentsId || node.LedgerEntryType !== 'Amendments') {
      throw new Error('Unable to verify amendments state.')
    }
    const ids = node.Amendments ?? []
    if (!Array.isArray(ids)) throw new Error('Unable to verify amendments state.')
    return ids.map(readHash).includes(mintOfferId)
  }

  issueTitle(input: TitleTerms, signing: RentalSigning) {
    const title = readTitle(input)
    return this.issue('title:' + digestTerms(title), titleAsset(title), signing, title)
  }

  async issuePass(bundle: RentalBundle, resource: RentalResource, signing: RentalSigning) {
    const rental = verifyRental(bundle, resource)
    const { proposal } = rental
    const result = await this.issue('pass:' + rental.agreementHash, passAsset(rental), signing, rental, async (snapshot) => {
      checkOfferWindow(rental.order.fundBy, snapshot)
      if (!await owns(this.rpc, titleAsset(rental.title), proposal.alice, proposal.titleNftId, snapshot.hash)) {
        throw new Error('Alice must own the registered title at issuance time.')
      }
    })
    return { agreementHash: rental.agreementHash, ...result }
  }

  acceptTitle(input: TitleTerms, ids: OfferIds, signing: RentalSigning) {
    const title = readTitle(input)
    return this.accept('title:' + digestTerms(title), titleAsset(title), ids, signing, title)
  }

  async acceptPass(bundle: RentalBundle, resource: RentalResource, ids: OfferIds, signing: RentalSigning) {
    const rental = verifyRental(bundle, resource)
    const result = await this.accept('pass:' + rental.agreementHash, passAsset(rental), ids, signing, rental)
    return { agreementHash: rental.agreementHash, ...result }
  }

  async revokePass(
    bundle: RentalBundle, resource: RentalResource, nftId: string, signing: RentalSigning,
    depositState: (rental: TitledRental, snapshot: Snapshot) => Promise<'missing' | 'present' | 'pending'>,
  ) {
    const rental = verifyRental(bundle, resource)
    const asset = passAsset(rental)
    const id = readHash(nftId)
    const key = 'pass:' + rental.agreementHash
    this.requireSigner(signing, asset.issuer)
    const stored = this.journal.read(JSON.stringify([asset.issuer, key, 'NFTokenBurn']))
    const readHolder = async (snapshot: Snapshot) => {
      if (snapshot.closeTime <= rippleTime(rental.order.fundBy)) throw new Error('Deposit deadline is still open.')
      if (await depositState(rental, snapshot) !== 'missing') {
        throw new Error('Deposit must be absent and reconciled on the validated ledger.')
      }
      if (await owns(this.rpc, asset, asset.recipient, id, snapshot.hash)) return asset.recipient
      if (await owns(this.rpc, asset, asset.issuer, id, snapshot.hash)) return asset.issuer
      throw new Error('Expected pass is not held by Bob or the authority.')
    }
    const previous = stored && decode(stored.attempt.blob)
    const holder = previous ? (previous.Owner ?? asset.issuer) : await readHolder(await recentSnapshot(this.rpc))
    const feeRefundDue = holder === asset.recipient
    const tx: NFTokenBurn = {
      TransactionType: 'NFTokenBurn', Account: asset.issuer, NFTokenID: id,
      ...(feeRefundDue && { Owner: asset.recipient }),
    }
    const result = await this.run(key, tx, signing, { ...rental, feeRefundDue }, async (snapshot) => {
      if (await readHolder(snapshot) !== holder) throw new Error('Pass holder has changed.')
    })
    return { ...result, agreementHash: rental.agreementHash, nftId: id, ...(result.status === 'validated' && { feeRefundDue }) }
  }

  private requireSigner(signing: RentalSigning, address: string) {
    if (signing.signer.classicAddress !== address) throw new Error('Unexpected signer for this operation.')
  }

  private run(
    key: string, tx: RentalTx, signing: RentalSigning, context: Fields,
    preflight?: (snapshot: Snapshot) => Promise<void>,
  ) {
    return runTransaction({
      rpc: this.rpc, journal: this.journal, orderId: key, tx, context, signer: signing.signer,
      confirm: (Fee) => signing.confirm({ ...tx, Fee }, context), preflight, pause: this.pause,
    })
  }

  private async issue(
    key: string, asset: Asset, signing: RentalSigning, terms: Fields, preflight?: (snapshot: Snapshot) => Promise<void>,
  ) {
    this.requireSigner(signing, asset.issuer)
    const saved = this.journal.read(JSON.stringify([asset.issuer, key, 'NFTokenMint']))
    const combined = saved ? decode(saved.attempt.blob).Amount !== undefined
      : asset.expiresAt !== undefined && await this.mintOfferEnabled()
    const tx: NFTokenMint = {
      TransactionType: 'NFTokenMint', Account: asset.issuer, NFTokenTaxon: 0, Flags: asset.flags, URI: asset.uri,
      ...(combined && offerFields(asset)),
    }
    const context = { ...terms, recipient: asset.recipient, ...offerFields(asset) }
    const mint = await this.run(key, tx, signing, context, preflight)
    if (mint.status !== 'validated') return { stage: 'mint' as const, ...mint }
    const nftId = mintedNftId(mint.meta)
    const offer = sale(asset, nftId)
    if (combined) {
      return {
        stage: 'offer' as const, status: 'validated' as const, nftId, offerId: createdOfferId(mint.meta, offer),
        mintReceipt: mint.receipt, offerReceipt: mint.receipt,
      }
    }
    const outcome = await this.run(key, offer, signing, context, async (snapshot) => {
      if (preflight) await preflight(snapshot)
      if (!await owns(this.rpc, asset, asset.issuer, nftId, snapshot.hash)) {
        throw new Error('Authority must own the newly minted NFT.')
      }
    })
    const issued = { stage: 'offer' as const, nftId, mintReceipt: mint.receipt }
    if (outcome.status !== 'validated') return { ...issued, ...outcome }
    return {
      ...issued, status: 'validated' as const,
      offerId: createdOfferId(outcome.meta, offer), offerReceipt: outcome.receipt,
    }
  }

  private async accept(key: string, asset: Asset, input: OfferIds, signing: RentalSigning, terms: Fields) {
    this.requireSigner(signing, asset.recipient)
    const ids = { nftId: readHash(input.nftId), offerId: readHash(input.offerId) }
    const tx: NFTokenAcceptOffer = {
      TransactionType: 'NFTokenAcceptOffer', Account: asset.recipient, NFTokenSellOffer: ids.offerId,
    }
    const outcome = await this.run(key, tx, signing, { ...terms, ...ids, ...asset }, async (snapshot) => {
      if (asset.expiresAt) checkOfferWindow(asset.expiresAt, snapshot)
      const result = await readAtSnapshot(this.rpc, 'ledger_entry', { nft_offer: ids.offerId }, snapshot.hash)
      const offer = record(result.node)
      if (offer.LedgerEntryType !== 'NFTokenOffer' || readHash(result.index ?? offer.index) !== ids.offerId
        || !matchesOffer(offer, asset, ids.nftId)
        || !await owns(this.rpc, asset, asset.issuer, ids.nftId, snapshot.hash)) {
        throw new Error('Token or offer does not match signed terms.')
      }
    })
    if (outcome.status !== 'validated') return outcome
    verifySaleMetadata(outcome.meta, asset, ids)
    return { status: 'validated' as const, ...ids, ...outcome.receipt, feeDrops: asset.amount, issuer: asset.issuer }
  }
}
