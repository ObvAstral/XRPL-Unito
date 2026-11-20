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
    throw new Error('Firma del wallet richiesta.')
  }
  const { publicKey, signature } = proof
  if (typeof publicKey !== 'string' || !/^(ED|02|03)[0-9A-Fa-f]{64}$/.test(publicKey)
    || typeof signature !== 'string' || !/^(?:[0-9A-Fa-f]{2}){64,72}$/.test(signature)) {
    throw new Error('Firma del wallet non valida.')
  }
  try {
    if (verify(signingBytes(purpose, message), signature, publicKey)) return deriveAddress(publicKey)
  } catch {
    // Le chiavi e le firme inviate dalla rete possono avere una codifica non valida.
  }
  throw new Error('Firma del wallet non valida.')
}

export class LocalSigner {
  readonly #wallet: Wallet

  constructor(wallet: Wallet) {
    if (deriveAddress(wallet.publicKey) !== wallet.classicAddress) {
      throw new Error('È richiesta la chiave principale del wallet.')
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
        throw new Error('È richiesto un file seed privato con permessi 0600.')
      }
      try {
        return new LocalSigner(Wallet.fromSeed(readFileSync(fd, 'utf8').trim()))
      } catch {
        throw new Error('Seed XRPL non valido.')
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
    if (transaction.Account !== this.classicAddress) throw new Error('La transazione appartiene a un altro wallet.')
    return this.#wallet.sign(transaction)
  }

  signPartial(transaction: Transaction) {
    if (transaction.Account === this.classicAddress || transaction.SigningPubKey !== ''
      || typeof transaction.Fee !== 'string' || !/^[1-9]\d*$/.test(transaction.Fee)
      || typeof transaction.Sequence !== 'number' || !Number.isInteger(transaction.Sequence) || transaction.Sequence < 1
      || typeof transaction.LastLedgerSequence !== 'number' || !Number.isInteger(transaction.LastLedgerSequence)
      || transaction.LastLedgerSequence < 1
      || transaction.Signers || transaction.TxnSignature) {
      throw new Error('È richiesta la transazione multifirma del vault già preparata, con fee, sequenza e ledger limite.')
    }
    return this.#wallet.sign(transaction, true)
  }
}
