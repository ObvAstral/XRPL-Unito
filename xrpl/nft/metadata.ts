import type { NFTokenCreateOffer } from 'xrpl'
import { readHash, record } from './pass.js'
import type { Fields } from './pass.js'

function tokenIds(fields: unknown): string[] {
  const rows = record(fields).NFTokens
  if (!Array.isArray(rows)) throw new Error('Missing NFT list in metadata.')
  return rows.map((row) => readHash(record(record(row).NFToken).NFTokenID))
}

export function mintedNftId(meta: Fields): string {
  if (meta.nftoken_id !== undefined) return readHash(meta.nftoken_id)
  if (!Array.isArray(meta.AffectedNodes)) throw new Error('Incomplete NFT metadata.')

  const before = new Set<string>()
  const after = new Set<string>()
  for (const entry of meta.AffectedNodes) {
    const { CreatedNode, DeletedNode, ModifiedNode } = record(entry)
    if (CreatedNode && record(CreatedNode).LedgerEntryType === 'NFTokenPage') {
      for (const id of tokenIds(record(CreatedNode).NewFields)) after.add(id)
    }
    if (DeletedNode && record(DeletedNode).LedgerEntryType === 'NFTokenPage') {
      for (const id of tokenIds(record(DeletedNode).FinalFields)) before.add(id)
    }
    if (ModifiedNode && record(ModifiedNode).LedgerEntryType === 'NFTokenPage') {
      const node = record(ModifiedNode)
      if (!node.PreviousFields || record(node.PreviousFields).NFTokens === undefined) continue
      for (const id of tokenIds(node.PreviousFields)) before.add(id)
      for (const id of tokenIds(node.FinalFields)) after.add(id)
    }
  }
  const [minted, ...other] = [...after].filter((id) => !before.has(id))
  if (!minted || other.length !== 0) throw new Error('Unable to extract a single NFT ID from validated transaction.')
  return minted
}

export function createdOfferId(meta: Fields, transaction: NFTokenCreateOffer): string {
  if (!Array.isArray(meta.AffectedNodes)) throw new Error('Incomplete offer metadata.')
  const ids = []
  for (const entry of meta.AffectedNodes) {
    const created = record(entry).CreatedNode
    if (!created) continue
    const node = record(created)
    if (node.LedgerEntryType !== 'NFTokenOffer') continue
    const fields = record(node.NewFields)
    // XRPL can omit the default zero amount in NewFields.
    const amount = fields.Amount === undefined ? '0' : fields.Amount
    if (
      fields.Owner === transaction.Account && readHash(fields.NFTokenID) === transaction.NFTokenID &&
      fields.Destination === transaction.Destination && amount === transaction.Amount &&
      fields.Expiration === transaction.Expiration && fields.Flags === 1
    ) ids.push(readHash(node.LedgerIndex))
  }
  const [id, ...other] = ids
  if (!id || other.length !== 0 || (meta.offer_id !== undefined && readHash(meta.offer_id) !== id)) {
    throw new Error('Unable to extract a single offer ID from validated transaction.')
  }
  return id
}
