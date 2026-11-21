import { constants, closeSync, fstatSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { deriveAddress, sign, verify } from 'ripple-keypairs'
import { Wallet, type Transaction } from 'xrpl'
import { canonicalJson } from './json.js'

export interface WalletSignature {
  publicKey: string
  signature: string
}

type Message = Parameters<typeof canonicalJson>[0]
type Purpose = 'login' | 'rental-proposal' | 'rental-order'

function signingBytes(purpose: Purpose, message: Message): string {
  return Buffer.from('xrpl-unito:v2:' + purpose + '\n' + canonicalJson(message), 'utf8').toString('hex')
}

export function verifyWalletSignature(purpose: Purpose, message: Message, proof: unknown): string {
  if (!proof || typeof proof !== 'object' || !('publicKey' in proof) || !('signature' in proof)) {
    throw new Error('Wallet signature required.')
  }
  const { publicKey, signature } = proof
  if (typeof publicKey !== 'string' || !/^(ED|02|03)[0-9A-Fa-f]{64}$/.test(publicKey)
    || typeof signature !== 'string' || !/^(?:[0-9A-Fa-f]{2}){64,72}$/.test(signature)) {
    throw new Error('Invalid wallet signature.')
  }
  try {
    if (verify(signingBytes(purpose, message), signature, publicKey)) return deriveAddress(publicKey)
  } catch {
    // Keys and signatures received over the network may have invalid encoding.
  }
  throw new Error('Invalid wallet signature.')
}

export class LocalSigner {
  readonly #wallet: Wallet

  constructor(wallet: Wallet) {
    if (deriveAddress(wallet.publicKey) !== wallet.classicAddress) {
      throw new Error('Wallet master key is required.')
    }
    this.#wallet = wallet
  }

  static create(seedFile: string): LocalSigner {
    const wallet = Wallet.generate()
    writeFileSync(seedFile, wallet.seed + '\n', { flag: 'wx', mode: 0o600, flush: true })
    return new LocalSigner(wallet)
  }

  static load(seedFile: string): LocalSigner {
    const fd = openSync(seedFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const file = fstatSync(fd)
      if (!file.isFile() || (file.mode & 0o777) !== 0o600 || file.size > 128) {
        throw new Error('Private seed file with 0600 permissions is required.')
      }
      try {
        return new LocalSigner(Wallet.fromSeed(readFileSync(fd, 'utf8').trim()))
      } catch {
        throw new Error('Invalid XRPL seed.')
      }
    } finally {
      closeSync(fd)
    }
  }

  get classicAddress(): string {
    return this.#wallet.classicAddress
  }

  signMessage(purpose: Purpose, message: Message): WalletSignature {
    return {
      publicKey: this.#wallet.publicKey,
      signature: sign(signingBytes(purpose, message), this.#wallet.privateKey),
    }
  }

  sign(transaction: Transaction) {
    if (transaction.Account !== this.classicAddress) throw new Error('Transaction belongs to another wallet.')
    return this.#wallet.sign(transaction)
  }

  signPartial(transaction: Transaction) {
    if (transaction.Account === this.classicAddress || transaction.SigningPubKey !== ''
      || typeof transaction.Fee !== 'string' || !/^[1-9]\d*$/.test(transaction.Fee)
      || typeof transaction.Sequence !== 'number' || !Number.isInteger(transaction.Sequence) || transaction.Sequence < 1
      || typeof transaction.LastLedgerSequence !== 'number' || !Number.isInteger(transaction.LastLedgerSequence)
      || transaction.LastLedgerSequence < 1
      || transaction.Signers || transaction.TxnSignature) {
      throw new Error('Prepared vault multisig transaction with fee, sequence, and last ledger sequence is required.')
    }
    return this.#wallet.sign(transaction, true)
  }
}
