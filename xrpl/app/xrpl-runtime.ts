import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RippledError,
  Wallet,
  decode,
  deriveAddress,
  encodeForMultiSigning,
  encodeForSigning,
  hashes,
  verifyKeypairSignature,
  type Request,
  type SubmittableTransaction,
} from 'xrpl'
import { LocalSigner } from '../agreement/wallet.js'
import { AttemptStore } from '../escrow/attempts.js'
import {
  EscrowLedger,
  connectTestnet as connectEscrowTestnet,
  type RpcClient,
} from '../escrow/ledger.js'
import {
  ASF_DISABLE_MASTER,
  AMENDMENTS_LEDGER_ENTRY_ID,
  FEE_SETTINGS_LEDGER_ENTRY_ID,
  LSF_DISABLE_MASTER,
  NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  RIPPLE_EPOCH_SECONDS,
  TF_PARTIAL_PAYMENT,
} from '../escrow/protocol.js'
import { EscrowService } from '../escrow/service.js'
import {
  runSetupWallets,
  type DevSecretsFile,
  type FaucetFunder,
} from '../escrow/vault-setup.js'
import { createdOfferId, mintedNftId } from '../nft/metadata.js'
import type { Fields, LedgerRequest } from '../nft/pass.js'
import { RentalNfts } from '../nft/rental.js'
import { RpcError, connectTestnet as connectNftTestnet } from '../nft/rpc.js'
import { AttemptJournal } from '../nft/transactions.js'
import type { PublicSetupOutput } from '../shared/escrow-order.js'
import { normalizeTestnetNode } from '../shared/testnet-node.js'

interface SimAccount {
  balanceDrops: bigint
  sequence: number
  flags: number
  ownerCount: number
  regularKey?: string
  signerList?: {
    signerQuorum: number
    signerEntries: Array<{ account: string; weight: number }>
  }
}

interface SimNft {
  nftId: string
  issuer: string
  holder: string
  flags: number
  uri: string
}

interface SimOffer {
  offerId: string
  owner: string
  nftId: string
  amount: string
  destination?: string
  flags: number
  expiration?: number
}

interface SimEscrow {
  objectId: string
  owner: string
  destination: string
  amount: string
  finishAfter: number
  sequence: number
}

interface SimTxRecord {
  hash: string
  ledgerIndex: number
  ledgerHash: string
  closeTime: number
  tx: Record<string, unknown>
  meta: Fields
}

interface SimLedgerSnapshot {
  index: number
  hash: string
  closeTime: number
  accounts: Map<string, SimAccount>
  nfts: Map<string, SimNft>
  offers: Map<string, SimOffer>
  escrows: Map<string, SimEscrow>
}

export class SimulatedXrplNode {
  private nowMillisValue: number
  private ledgerIndex = 100
  private available = true
  private loseNextSubmitReply = false
  private autoValidateSubmits = true
  private readonly pendingBlobs: Array<{ blob: string; style: 'nft' | 'escrow' }> = []
  private combinedMintOffer: boolean
  private readonly accounts = new Map<string, SimAccount>()
  private readonly nfts = new Map<string, SimNft>()
  private readonly offers = new Map<string, SimOffer>()
  private readonly escrows = new Map<string, SimEscrow>()
  private readonly transactions = new Map<string, SimTxRecord>()
  private readonly accountTxHistory = new Map<string, SimTxRecord[]>()
  private readonly snapshotsByHash = new Map<string, SimLedgerSnapshot>()
  private readonly snapshotsByIndex = new Map<number, SimLedgerSnapshot>()
  private nftCounter = 1
  private offerCounter = 1

  constructor(options?: { readonly nowMillis?: number; readonly combinedMintOffer?: boolean }) {
    this.nowMillisValue = Math.floor((options?.nowMillis ?? Date.now()) / 1000) * 1000
    this.combinedMintOffer = options?.combinedMintOffer ?? false
    this.commitSnapshot()
  }

  readonly nowMillis = (): number => this.nowMillisValue

  setNowMillis(millis: number): void {
    this.nowMillisValue = Math.floor(millis / 1000) * 1000
    this.ledgerIndex += 1
    this.commitSnapshot()
  }

  advanceSeconds(seconds: number): void {
    this.setNowMillis(this.nowMillisValue + seconds * 1000)
  }

  setAvailable(available: boolean): void {
    this.available = available
  }

  isAvailable(): boolean {
    return this.available
  }

  loseNextSubmit(): void {
    this.loseNextSubmitReply = true
  }

  setAutoValidateSubmits(enabled: boolean): void {
    this.autoValidateSubmits = enabled
  }

  flushPendingSubmits(): void {
    const items = this.pendingBlobs.splice(0, this.pendingBlobs.length)
    for (const item of items) {
      this.executeBlob(item.blob, item.style)
    }
  }

  setCombinedMintOffer(enabled: boolean): void {
    this.combinedMintOffer = enabled
  }

  getBalanceDrops(address: string): bigint {
    return this.accounts.get(address)?.balanceDrops ?? 0n
  }

  fundAccount(address: string, amountDrops = 100_000_000n): void {
    const existing = this.accounts.get(address)
    if (existing) {
      existing.balanceDrops += amountDrops
    } else {
      this.accounts.set(address, {
        balanceDrops: amountDrops,
        sequence: 1,
        flags: 0,
        ownerCount: 0,
      })
    }
    this.ledgerIndex += 1
    this.commitSnapshot()
  }

  private currentCloseTime(): number {
    return Math.floor(this.nowMillisValue / 1000) - RIPPLE_EPOCH_SECONDS
  }

  private hashForIndex(index: number): string {
    return `E${index.toString(16).toUpperCase().padStart(63, '0')}`
  }

  private commitSnapshot(): SimLedgerSnapshot {
    const hash = this.hashForIndex(this.ledgerIndex)
    const accounts = new Map<string, SimAccount>()
    for (const [k, v] of this.accounts.entries()) {
      accounts.set(k, {
        ...v,
        ...(v.signerList
          ? {
              signerList: {
                signerQuorum: v.signerList.signerQuorum,
                signerEntries: v.signerList.signerEntries.map((e) => ({ ...e })),
              },
            }
          : {}),
      })
    }
    const nfts = new Map<string, SimNft>()
    for (const [k, v] of this.nfts.entries()) nfts.set(k, { ...v })
    const offers = new Map<string, SimOffer>()
    for (const [k, v] of this.offers.entries()) offers.set(k, { ...v })
    const escrows = new Map<string, SimEscrow>()
    for (const [k, v] of this.escrows.entries()) escrows.set(k, { ...v })

    const snap: SimLedgerSnapshot = {
      index: this.ledgerIndex,
      hash,
      closeTime: this.currentCloseTime(),
      accounts,
      nfts,
      offers,
      escrows,
    }
    this.snapshotsByHash.set(hash, snap)
    this.snapshotsByIndex.set(this.ledgerIndex, snap)
    return snap
  }

  private getLatestSnapshot(): SimLedgerSnapshot {
    return this.snapshotsByIndex.get(this.ledgerIndex)!
  }

  private resolveSnapshot(fields: { ledger_hash?: unknown; ledger_index?: unknown }): SimLedgerSnapshot {
    if (typeof fields.ledger_hash === 'string') {
      const snap = this.snapshotsByHash.get(fields.ledger_hash.toUpperCase())
      if (!snap) throw new Error('Snapshot ledger_hash non trovato')
      return snap
    }
    if (typeof fields.ledger_index === 'number') {
      const snap = this.snapshotsByIndex.get(fields.ledger_index)
      if (!snap) throw new Error('Snapshot ledger_index non trovato')
      return snap
    }
    return this.getLatestSnapshot()
  }

  private appendAccountHistory(address: string, record: SimTxRecord): void {
    const list = this.accountTxHistory.get(address) ?? []
    list.push(record)
    this.accountTxHistory.set(address, list)
  }

  private verifyTxAuthorization(
    tx: Record<string, unknown>,
    account: SimAccount,
    errorStyle: 'nft' | 'escrow',
  ): void {
    const sender = String(tx.Account)
    const signingPubKey = typeof tx.SigningPubKey === 'string' ? tx.SigningPubKey : ''
    if (signingPubKey === '') {
      const signers = tx.Signers as Array<{ Signer?: { Account?: string; SigningPubKey?: string; TxnSignature?: string } }> | undefined
      if (!Array.isArray(signers) || !account.signerList) {
        this.throwCode('tefBAD_AUTH', errorStyle)
      }
      let totalWeight = 0
      const seen = new Set<string>()
      const unsignedCopy: Record<string, unknown> = { ...tx }
      delete unsignedCopy.Signers
      for (const item of signers) {
        const s = item?.Signer
        if (!s?.Account || !s.SigningPubKey || !s.TxnSignature) {
          this.throwCode('tefBAD_SIGNATURE', errorStyle)
        }
        if (seen.has(s.Account) || deriveAddress(s.SigningPubKey) !== s.Account) {
          this.throwCode('tefBAD_SIGNATURE', errorStyle)
        }
        seen.add(s.Account)
        const entry = account.signerList.signerEntries.find((e) => e.account === s.Account)
        if (!entry) this.throwCode('tefBAD_AUTH', errorStyle)
        const signingPayload = encodeForMultiSigning(unsignedCopy as never, s.Account)
        if (!verifyKeypairSignature(signingPayload, s.TxnSignature, s.SigningPubKey)) {
          this.throwCode('tefBAD_SIGNATURE', errorStyle)
        }
        totalWeight += entry.weight
      }
      if (totalWeight < account.signerList.signerQuorum) {
        this.throwCode('tefBAD_QUORUM', errorStyle)
      }
      return
    }

    if ((account.flags & LSF_DISABLE_MASTER) !== 0) {
      this.throwCode('tefMASTER_DISABLED', errorStyle)
    }
    if (deriveAddress(signingPubKey) !== sender || typeof tx.TxnSignature !== 'string') {
      this.throwCode('tefBAD_SIGNATURE', errorStyle)
    }
    const unsignedCopy: Record<string, unknown> = { ...tx }
    delete unsignedCopy.TxnSignature
    const payload = encodeForSigning(unsignedCopy as never)
    if (!verifyKeypairSignature(payload, tx.TxnSignature, signingPubKey)) {
      this.throwCode('tefBAD_SIGNATURE', errorStyle)
    }
  }

  private throwCode(code: string, style: 'nft' | 'escrow', searchedAll = false): never {
    if (style === 'nft') {
      throw new RpcError(code, searchedAll)
    }
    throw new RippledError(code, { error: code, searched_all: searchedAll })
  }

  private submitBlob(blob: string, style: 'nft' | 'escrow'): void {
    const hash = hashes.hashSignedTx(blob).toUpperCase()
    const shouldDropReply = this.loseNextSubmitReply
    this.loseNextSubmitReply = false

    if (this.transactions.has(hash)) {
      if (shouldDropReply) throw new Error('Risposta RPC submit persa')
      return
    }

    if (!this.autoValidateSubmits) {
      if (!this.pendingBlobs.some((b) => b.blob === blob)) {
        this.pendingBlobs.push({ blob, style })
      }
      if (shouldDropReply) throw new Error('Risposta RPC submit persa')
      return
    }

    this.executeBlob(blob, style)
    if (shouldDropReply) {
      throw new Error('Risposta RPC submit persa')
    }
  }

  private executeBlob(blob: string, style: 'nft' | 'escrow'): void {
    const hash = hashes.hashSignedTx(blob).toUpperCase()
    if (this.transactions.has(hash)) return

    const tx = decode(blob) as Record<string, unknown>
    const senderAddress = String(tx.Account)
    const sender = this.accounts.get(senderAddress)
    if (!sender) {
      this.throwCode('terNO_ACCOUNT', style)
    }
    this.verifyTxAuthorization(tx, sender, style)

    const seq = Number(tx.Sequence)
    const lastLedger = typeof tx.LastLedgerSequence === 'number' ? tx.LastLedgerSequence : undefined
    if (seq !== sender.sequence) {
      this.throwCode('tefPAST_SEQ', style)
    }
    if (lastLedger !== undefined && this.ledgerIndex + 1 > lastLedger) {
      this.throwCode('tefMAX_LEDGER', style)
    }

    const feeDrops = BigInt(String(tx.Fee ?? '12'))
    if (sender.balanceDrops < feeDrops) {
      this.throwCode('terINSUF_FEE_B', style)
    }

    sender.balanceDrops -= feeDrops
    sender.sequence += 1
    this.ledgerIndex += 1
    const closeTime = this.currentCloseTime()
    const lgrHash = this.hashForIndex(this.ledgerIndex)

    const affectedNodes: Fields[] = []
    let txResult = 'tesSUCCESS'
    let nftokenIdMeta: string | undefined
    let offerIdMeta: string | undefined
    let deliveredAmount: string | undefined

    const txType = String(tx.TransactionType)

    if (txType === 'SignerListSet') {
      const hadList = sender.signerList !== undefined
      const entries = (tx.SignerEntries as Array<{ SignerEntry: { Account: string; SignerWeight: number } }>).map(
        (e) => ({
          account: e.SignerEntry.Account,
          weight: e.SignerEntry.SignerWeight,
        }),
      )
      sender.signerList = {
        signerQuorum: Number(tx.SignerQuorum),
        signerEntries: entries,
      }
      if (!hadList) sender.ownerCount += 1
    } else if (txType === 'AccountSet') {
      if (Number(tx.SetFlag) === ASF_DISABLE_MASTER) {
        if (!sender.signerList && !sender.regularKey) {
          txResult = 'tecNO_ALTERNATIVE_KEY'
        } else {
          sender.flags |= LSF_DISABLE_MASTER
        }
      }
    } else if (txType === 'NFTokenMint') {
      const nextNum = this.nftCounter++
      const nftId = nextNum.toString(16).toUpperCase().padStart(64, '0')
      const uri = typeof tx.URI === 'string' ? tx.URI.toUpperCase() : ''
      const flags = typeof tx.Flags === 'number' ? tx.Flags : 0
      this.nfts.set(nftId, {
        nftId,
        issuer: senderAddress,
        holder: senderAddress,
        flags,
        uri,
      })
      nftokenIdMeta = nftId
      affectedNodes.push({
        CreatedNode: {
          LedgerEntryType: 'NFTokenPage',
          LedgerIndex: nextNum.toString(16).toUpperCase().padStart(64, 'A'),
          NewFields: { NFTokens: [{ NFToken: { NFTokenID: nftId, URI: uri } }] },
        },
      })
      if (tx.Destination !== undefined || tx.Amount !== undefined) {
        const offerNum = this.offerCounter++
        const offerId = `F${offerNum.toString(16).toUpperCase().padStart(63, '0')}`
        const offer: SimOffer = {
          offerId,
          owner: senderAddress,
          nftId,
          amount: String(tx.Amount ?? '0'),
          ...(typeof tx.Destination === 'string' ? { destination: tx.Destination } : {}),
          flags: 1,
          ...(typeof tx.Expiration === 'number' ? { expiration: tx.Expiration } : {}),
        }
        this.offers.set(offerId, offer)
        offerIdMeta = offerId
        affectedNodes.push({
          CreatedNode: {
            LedgerEntryType: 'NFTokenOffer',
            LedgerIndex: offerId,
            NewFields: {
              Owner: offer.owner,
              NFTokenID: offer.nftId,
              Amount: offer.amount,
              ...(offer.destination ? { Destination: offer.destination } : {}),
              Flags: 1,
              ...(offer.expiration !== undefined ? { Expiration: offer.expiration } : {}),
            },
          },
        })
      }
    } else if (txType === 'NFTokenCreateOffer') {
      const nftId = String(tx.NFTokenID).toUpperCase()
      const nft = this.nfts.get(nftId)
      if (!nft || nft.holder !== senderAddress) {
        txResult = 'tecNO_ENTRY'
      } else {
        const offerNum = this.offerCounter++
        const offerId = `F${offerNum.toString(16).toUpperCase().padStart(63, '0')}`
        const offer: SimOffer = {
          offerId,
          owner: senderAddress,
          nftId,
          amount: String(tx.Amount ?? '0'),
          ...(typeof tx.Destination === 'string' ? { destination: tx.Destination } : {}),
          flags: 1,
          ...(typeof tx.Expiration === 'number' ? { expiration: tx.Expiration } : {}),
        }
        this.offers.set(offerId, offer)
        offerIdMeta = offerId
        affectedNodes.push({
          CreatedNode: {
            LedgerEntryType: 'NFTokenOffer',
            LedgerIndex: offerId,
            NewFields: {
              Owner: offer.owner,
              NFTokenID: offer.nftId,
              Amount: offer.amount,
              ...(offer.destination ? { Destination: offer.destination } : {}),
              Flags: 1,
              ...(offer.expiration !== undefined ? { Expiration: offer.expiration } : {}),
            },
          },
        })
      }
    } else if (txType === 'NFTokenAcceptOffer') {
      const offerId = String(tx.NFTokenSellOffer).toUpperCase()
      const offer = this.offers.get(offerId)
      if (!offer) {
        txResult = 'tecOBJECT_NOT_FOUND'
      } else if (offer.destination && offer.destination !== senderAddress) {
        txResult = 'tecNO_PERMISSION'
      } else if (offer.expiration !== undefined && closeTime >= offer.expiration) {
        txResult = 'tecEXPIRED'
      } else {
        const amountDrops = BigInt(offer.amount)
        const seller = this.accounts.get(offer.owner)
        const nft = this.nfts.get(offer.nftId)
        if (!seller || !nft || nft.holder !== offer.owner) {
          txResult = 'tecNO_ENTRY'
        } else if (sender.balanceDrops < amountDrops) {
          txResult = 'tecUNFUNDED_PAYMENT'
        } else {
          const prevSellerBal = seller.balanceDrops
          sender.balanceDrops -= amountDrops
          seller.balanceDrops += amountDrops
          nft.holder = senderAddress
          this.offers.delete(offerId)
          affectedNodes.push({
            DeletedNode: {
              LedgerEntryType: 'NFTokenOffer',
              LedgerIndex: offerId,
              FinalFields: {
                Owner: offer.owner,
                NFTokenID: offer.nftId,
                Amount: offer.amount,
                ...(offer.destination ? { Destination: offer.destination } : {}),
                Flags: 1,
                ...(offer.expiration !== undefined ? { Expiration: offer.expiration } : {}),
              },
            },
          })
          affectedNodes.push({
            ModifiedNode: {
              LedgerEntryType: 'AccountRoot',
              LedgerIndex: `9${offer.owner.slice(0, 8)}`.padEnd(64, '0'),
              PreviousFields: { Balance: prevSellerBal.toString() },
              FinalFields: { Account: offer.owner, Balance: seller.balanceDrops.toString() },
            },
          })
        }
      }
    } else if (txType === 'NFTokenBurn') {
      const nftId = String(tx.NFTokenID).toUpperCase()
      const nft = this.nfts.get(nftId)
      const targetHolder = typeof tx.Owner === 'string' ? tx.Owner : senderAddress
      if (!nft || nft.holder !== targetHolder) {
        txResult = 'tecNO_ENTRY'
      } else if (targetHolder !== senderAddress && (nft.issuer !== senderAddress || (nft.flags & 1) === 0)) {
        txResult = 'tecNO_PERMISSION'
      } else {
        this.nfts.delete(nftId)
        affectedNodes.push({
          DeletedNode: {
            LedgerEntryType: 'NFTokenPage',
            LedgerIndex: nftId,
            FinalFields: { NFTokenID: nftId },
          },
        })
      }
    } else if (txType === 'EscrowCreate') {
      const amountDrops = BigInt(String(tx.Amount))
      const finishAfter = Number(tx.FinishAfter)
      const destination = String(tx.Destination)
      if (!this.accounts.has(destination)) {
        txResult = 'tecNO_DST'
      } else if (sender.balanceDrops < amountDrops) {
        txResult = 'tecUNFUNDED'
      } else {
        const objectId = hashes.hashEscrow(senderAddress, seq).toUpperCase()
        sender.balanceDrops -= amountDrops
        sender.ownerCount += 1
        this.escrows.set(objectId, {
          objectId,
          owner: senderAddress,
          destination,
          amount: amountDrops.toString(),
          finishAfter,
          sequence: seq,
        })
      }
    } else if (txType === 'EscrowFinish') {
      const ownerAddress = String(tx.Owner)
      const offerSeq = Number(tx.OfferSequence)
      const objectId = hashes.hashEscrow(ownerAddress, offerSeq).toUpperCase()
      const escrow = this.escrows.get(objectId)
      if (!escrow) {
        txResult = 'tecNO_TARGET'
      } else if (closeTime <= escrow.finishAfter) {
        txResult = 'tecNO_PERMISSION'
      } else {
        const ownerAccount = this.accounts.get(ownerAddress)
        const dstAccount = this.accounts.get(escrow.destination)
        if (!dstAccount) {
          txResult = 'tecNO_DST'
        } else {
          this.escrows.delete(objectId)
          if (ownerAccount && ownerAccount.ownerCount > 0) ownerAccount.ownerCount -= 1
          dstAccount.balanceDrops += BigInt(escrow.amount)
          affectedNodes.push({
            DeletedNode: {
              LedgerEntryType: 'Escrow',
              LedgerIndex: objectId,
              FinalFields: {
                Account: escrow.owner,
                Destination: escrow.destination,
                Amount: escrow.amount,
                FinishAfter: escrow.finishAfter,
              },
            },
          })
        }
      }
    } else if (txType === 'Payment') {
      const destination = String(tx.Destination)
      const amountDrops = BigInt(String(tx.Amount))
      const dstAccount = this.accounts.get(destination)
      if (!dstAccount) {
        txResult = 'tecNO_DST'
      } else if ((Number(tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0) {
        txResult = 'temBAD_SEND_XRP_PARTIAL'
      } else if (sender.balanceDrops < amountDrops) {
        txResult = 'tecUNFUNDED_PAYMENT'
      } else {
        sender.balanceDrops -= amountDrops
        dstAccount.balanceDrops += amountDrops
        deliveredAmount = amountDrops.toString()
      }
    } else {
      txResult = 'temUNKNOWN'
    }

    const meta: Fields = {
      TransactionIndex: 0,
      TransactionResult: txResult,
      AffectedNodes: affectedNodes,
      ...(nftokenIdMeta !== undefined ? { nftoken_id: nftokenIdMeta } : {}),
      ...(offerIdMeta !== undefined ? { offer_id: offerIdMeta } : {}),
      ...(deliveredAmount !== undefined ? { delivered_amount: deliveredAmount } : {}),
    }

    const record: SimTxRecord = {
      hash,
      ledgerIndex: this.ledgerIndex,
      ledgerHash: lgrHash,
      closeTime,
      tx: { ...tx, date: closeTime },
      meta,
    }
    this.transactions.set(hash, record)
    this.appendAccountHistory(senderAddress, record)
    if (txType === 'EscrowFinish' && typeof tx.Owner === 'string' && tx.Owner !== senderAddress) {
      this.appendAccountHistory(tx.Owner, record)
    }

    this.commitSnapshot()
  }

  private handleRequest(command: string, fields: Fields, style: 'nft' | 'escrow'): Fields {
    if (!this.available) {
      throw new Error('Nodo XRPL simulato non disponibile')
    }

    switch (command) {
      case 'server_info':
        return { info: { network_id: 1 } }
      case 'server_state': {
        const snap = this.getLatestSnapshot()
        return {
          state: {
            validated_ledger: {
              base_fee: 10,
              close_time: snap.closeTime,
              hash: snap.hash,
              reserve_base: 1_000_000,
              reserve_inc: 200_000,
              seq: snap.index,
            },
          },
        }
      }
      case 'fee':
        return { drops: { open_ledger_fee: '12' } }
      case 'ledger': {
        const snap = this.resolveSnapshot(fields)
        return {
          ledger_hash: snap.hash,
          ledger_index: snap.index,
          validated: true,
          ledger: { close_time: snap.closeTime, ledger_hash: snap.hash, ledger_index: snap.index },
        }
      }
      case 'account_info': {
        const snap = this.resolveSnapshot(fields)
        const address = String(fields.account)
        const acct = snap.accounts.get(address)
        if (!acct) this.throwCode('actNotFound', style)
        return {
          validated: true,
          ledger_hash: snap.hash,
          ledger_index: snap.index,
          account_data: {
            LedgerEntryType: 'AccountRoot',
            Account: address,
            Balance: acct.balanceDrops.toString(),
            Flags: acct.flags,
            OwnerCount: acct.ownerCount,
            Sequence: acct.sequence,
            ...(acct.regularKey ? { RegularKey: acct.regularKey } : {}),
          },
          ...(fields.signer_lists && acct.signerList
            ? {
                signer_lists: [
                  {
                    LedgerEntryType: 'SignerList',
                    Flags: 65536,
                    SignerListID: 0,
                    SignerQuorum: acct.signerList.signerQuorum,
                    SignerEntries: acct.signerList.signerEntries.map((e) => ({
                      SignerEntry: { Account: e.account, SignerWeight: e.weight },
                    })),
                  },
                ],
              }
            : {}),
        }
      }
      case 'account_nfts': {
        const snap = this.resolveSnapshot(fields)
        const address = String(fields.account)
        if (!snap.accounts.has(address)) this.throwCode('actNotFound', style)
        const accountNfts = [...snap.nfts.values()]
          .filter((n) => n.holder === address)
          .map((n) => ({
            NFTokenID: n.nftId,
            Issuer: n.issuer,
            Flags: n.flags,
            URI: n.uri,
          }))
        return {
          validated: true,
          ledger_hash: snap.hash,
          ledger_index: snap.index,
          account: address,
          account_nfts: accountNfts,
        }
      }
      case 'account_objects': {
        const snap = this.resolveSnapshot(fields)
        const address = String(fields.account)
        if (!snap.accounts.has(address)) this.throwCode('actNotFound', style)
        if (fields.type === 'escrow') {
          const objects = [...snap.escrows.values()]
            .filter((e) => e.owner === address)
            .map((e) => ({
              LedgerEntryType: 'Escrow',
              Account: e.owner,
              Destination: e.destination,
              Amount: e.amount,
              FinishAfter: e.finishAfter,
              index: e.objectId,
            }))
          return { validated: true, ledger_hash: snap.hash, account: address, account_objects: objects }
        }
        return { validated: true, ledger_hash: snap.hash, account: address, account_objects: [] }
      }
      case 'ledger_entry': {
        const snap = this.resolveSnapshot(fields)
        if (fields.index === FEE_SETTINGS_LEDGER_ENTRY_ID) {
          return {
            validated: true,
            ledger_hash: snap.hash,
            index: FEE_SETTINGS_LEDGER_ENTRY_ID,
            node: {
              LedgerEntryType: 'FeeSettings',
              BaseFeeDrops: '10',
              ReserveBaseDrops: '1000000',
              ReserveIncrementDrops: '200000',
            },
          }
        }
        if (fields.index === AMENDMENTS_LEDGER_ENTRY_ID) {
          return {
            validated: true,
            ledger_hash: snap.hash,
            index: AMENDMENTS_LEDGER_ENTRY_ID,
            node: {
              LedgerEntryType: 'Amendments',
              Amendments: this.combinedMintOffer ? [NFTOKEN_MINT_OFFER_AMENDMENT_ID] : [],
            },
          }
        }
        if (typeof fields.nft_offer === 'string') {
          const offerId = fields.nft_offer.toUpperCase()
          const offer = snap.offers.get(offerId)
          if (!offer) this.throwCode('entryNotFound', style)
          return {
            validated: true,
            ledger_hash: snap.hash,
            index: offerId,
            node: {
              LedgerEntryType: 'NFTokenOffer',
              Owner: offer.owner,
              NFTokenID: offer.nftId,
              Amount: offer.amount,
              ...(offer.destination ? { Destination: offer.destination } : {}),
              Flags: offer.flags,
              ...(offer.expiration !== undefined ? { Expiration: offer.expiration } : {}),
            },
          }
        }
        if (typeof fields.escrow === 'string') {
          const escrowId = fields.escrow.toUpperCase()
          const escrow = snap.escrows.get(escrowId)
          if (!escrow) this.throwCode('entryNotFound', style)
          return {
            validated: true,
            ledger_hash: snap.hash,
            index: escrowId,
            node: {
              LedgerEntryType: 'Escrow',
              Account: escrow.owner,
              Destination: escrow.destination,
              Amount: escrow.amount,
              FinishAfter: escrow.finishAfter,
            },
          }
        }
        this.throwCode('entryNotFound', style)
      }
      case 'account_tx': {
        const address = String(fields.account)
        const minIdx = typeof fields.ledger_index_min === 'number' ? fields.ledger_index_min : 0
        const maxIdx = typeof fields.ledger_index_max === 'number' ? fields.ledger_index_max : Number.MAX_SAFE_INTEGER
        const list = (this.accountTxHistory.get(address) ?? [])
          .filter((r) => r.ledgerIndex >= minIdx && r.ledgerIndex <= maxIdx)
          .map((r) => ({
            validated: true,
            hash: r.hash,
            ledger_index: r.ledgerIndex,
            ledger_hash: r.ledgerHash,
            tx_json: r.tx,
            meta: r.meta,
          }))
        return { transactions: list }
      }
      case 'tx': {
        const hash = String(fields.transaction).toUpperCase()
        const rec = this.transactions.get(hash)
        if (!rec) this.throwCode('txnNotFound', style, true)
        return {
          validated: true,
          hash: rec.hash,
          ledger_index: rec.ledgerIndex,
          ledger_hash: rec.ledgerHash,
          tx_json: rec.tx,
          meta: rec.meta,
        }
      }
      case 'submit': {
        this.submitBlob(String(fields.tx_blob), style)
        return { engine_result: 'tesSUCCESS' }
      }
      default:
        throw new Error(`Comando XRPL simulato non supportato: ${command}`)
    }
  }

  asNftRpc(): LedgerRequest {
    return async (command: string, fields: Fields = {}) =>
      this.handleRequest(command, fields, 'nft')
  }

  asEscrowClient(): RpcClient {
    return {
      request: async <R = Record<string, unknown>>(req: Request) => ({
        result: this.handleRequest(
          req.command,
          req as unknown as Fields,
          'escrow',
        ) as R,
      }) as never,
      autofill: async <T extends SubmittableTransaction>(
        tx: T,
        signersCount?: number,
      ): Promise<T> => {
        if (!this.available) {
          throw new Error('Nodo XRPL simulato non disponibile')
        }
        const acct = this.accounts.get(tx.Account)
        if (!acct) throw new RippledError('actNotFound', { error: 'actNotFound' })
        const fee = signersCount ? String(10 * (1 + signersCount)) : '12'
        return {
          ...tx,
          Sequence: acct.sequence,
          Fee: fee,
        }
      },
    }
  }

  createFaucetFunder(): FaucetFunder {
    return async (address: string) => {
      this.fundAccount(address, 100_000_000n)
    }
  }
}

export interface RoleSignersBundle {
  readonly alice: LocalSigner
  readonly bob: LocalSigner
  readonly cadAuthority: LocalSigner
  readonly billboardAuthority: LocalSigner
  readonly operator: LocalSigner
}

export interface XrplRuntime {
  readonly mode: 'simulated' | 'testnet'
  readonly setup: PublicSetupOutput
  readonly signers: RoleSignersBundle
  readonly nftRpc: LedgerRequest
  readonly nftJournal: AttemptJournal
  readonly rentalNfts: RentalNfts
  readonly escrowLedger: EscrowLedger
  readonly attemptStore: AttemptStore
  readonly escrowService: EscrowService
  readonly simulatedNode?: SimulatedXrplNode
  readonly nowMillis: () => number
  close(): Promise<void>
}

function signerFromSeed(seed: string | null, label: string): LocalSigner {
  if (!seed) throw new Error(`Seed mancante per ${label}`)
  return new LocalSigner(Wallet.fromSeed(seed))
}

export async function createSimulatedRuntime(options: {
  readonly stateDir: string
  readonly node?: SimulatedXrplNode
  readonly combinedMintOffer?: boolean
}): Promise<XrplRuntime> {
  mkdirSync(options.stateDir, { recursive: true, mode: 0o700 })
  const node =
    options.node ??
    new SimulatedXrplNode({ combinedMintOffer: options.combinedMintOffer ?? false })

  const attemptStore = new AttemptStore(options.stateDir)
  const nftJournal = new AttemptJournal(join(options.stateDir, 'nft-attempts.sqlite'))
  const escrowLedger = new EscrowLedger(node.asEscrowClient(), node.nowMillis)
  const nftRpc = node.asNftRpc()

  const { secrets, publicOutput } = await runSetupWallets({
    stateDir: options.stateDir,
    ledger: escrowLedger,
    attempts: attemptStore,
    faucetFund: node.createFaucetFunder(),
    pollIntervalMs: 1,
    maxSettlePolls: 5,
    wait: async () => {},
  })

  const signers: RoleSignersBundle = {
    alice: signerFromSeed(secrets.participants.alice.seed, 'alice'),
    bob: signerFromSeed(secrets.participants.bob.seed, 'bob'),
    cadAuthority: signerFromSeed(secrets.participants.cadAuthority.seed, 'cadAuthority'),
    billboardAuthority: signerFromSeed(secrets.participants.billboardAuthority.seed, 'billboardAuthority'),
    operator: signerFromSeed(secrets.participants.operator.seed, 'operator'),
  }

  return {
    mode: 'simulated',
    setup: publicOutput,
    signers,
    nftRpc,
    nftJournal,
    rentalNfts: new RentalNfts(nftRpc, nftJournal, async () => {}),
    escrowLedger,
    attemptStore,
    escrowService: new EscrowService(escrowLedger, attemptStore),
    simulatedNode: node,
    nowMillis: node.nowMillis,
    async close() {
      nftJournal.close()
      attemptStore.close()
    },
  }
}

export async function createTestnetRuntime(options: {
  readonly stateDir: string
  readonly nodeName?: string
}): Promise<XrplRuntime> {
  const publicPath = join(options.stateDir, 'public-config.json')
  const secretsPath = join(options.stateDir, 'dev-secrets.json')
  if (!existsSync(publicPath) || !existsSync(secretsPath)) {
    throw new Error(
      `Configurazione Testnet mancante in ${options.stateDir}. Eseguire prima: npm --prefix xrpl run setup:wallets`,
    )
  }

  const setup = JSON.parse(readFileSync(publicPath, 'utf8')) as PublicSetupOutput
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8')) as DevSecretsFile
  const normalizedNode = normalizeTestnetNode(options.nodeName)

  const nftRpc = await connectNftTestnet(normalizedNode)
  const { client, ledger: escrowLedger } = await connectEscrowTestnet(normalizedNode)
  const attemptStore = new AttemptStore(options.stateDir)
  const nftJournal = new AttemptJournal(join(options.stateDir, 'nft-attempts.sqlite'))

  const signers: RoleSignersBundle = {
    alice: signerFromSeed(secrets.participants.alice.seed, 'alice'),
    bob: signerFromSeed(secrets.participants.bob.seed, 'bob'),
    cadAuthority: signerFromSeed(secrets.participants.cadAuthority.seed, 'cadAuthority'),
    billboardAuthority: signerFromSeed(secrets.participants.billboardAuthority.seed, 'billboardAuthority'),
    operator: signerFromSeed(secrets.participants.operator.seed, 'operator'),
  }

  return {
    mode: 'testnet',
    setup,
    signers,
    nftRpc,
    nftJournal,
    rentalNfts: new RentalNfts(nftRpc, nftJournal),
    escrowLedger,
    attemptStore,
    escrowService: new EscrowService(escrowLedger, attemptStore),
    nowMillis: () => Date.now(),
    async close() {
      nftJournal.close()
      attemptStore.close()
      await client.disconnect()
    },
  }
}

export function saveInitialTitlesFile(
  stateDir: string,
  titles: Readonly<Record<string, { titleNftId: string; validFrom: string; validTo: string }>>,
): void {
  writeFileSync(join(stateDir, 'titles.json'), `${JSON.stringify(titles, null, 2)}\n`, { mode: 0o600 })
}

export function loadInitialTitlesFile(
  stateDir: string,
): Record<string, { titleNftId: string; validFrom: string; validTo: string }> | null {
  const filePath = join(stateDir, 'titles.json')
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<
    string,
    { titleNftId: string; validFrom: string; validTo: string }
  >
}
