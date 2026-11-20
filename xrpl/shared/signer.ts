import type { SubmittableTransaction, Wallet } from 'xrpl'

export type PaymentPromptAction =
  | 'vault_signer_list'
  | 'vault_disable_master'
  | 'escrow_create'
  | 'escrow_finish'
  | 'vault_payout'
  | 'fee_refund'

export interface SignPromptContext {
  readonly orderId: string
  readonly action: PaymentPromptAction
  readonly feeDrops: string
  readonly summary: Readonly<Record<string, string | number>>
}

export interface SignedTransactionBlob {
  readonly hash: string
  readonly tx_blob: string
  readonly signerAddress: string
}

/**
 * Interfaccia consegnata da Persona A (o implementata localmente coi wallet di sviluppo)
 * per richiedere firme singole oppure firme parziali destinate alla multifirma 2 su 3 del vault.
 */
export interface RoleSigner {
  readonly address: string
  signSingle(
    tx: SubmittableTransaction,
    context: SignPromptContext,
  ): Promise<SignedTransactionBlob>
  signForMultisig(
    tx: SubmittableTransaction,
    context: SignPromptContext,
  ): Promise<SignedTransactionBlob>
}

export type ConfirmPrompt = (context: SignPromptContext) => Promise<boolean>

export function createWalletSigner(
  wallet: Wallet,
  confirm: ConfirmPrompt = async () => true,
): RoleSigner {
  return {
    address: wallet.classicAddress,
    async signSingle(tx, context) {
      if (tx.Account !== wallet.classicAddress) {
        throw new Error(`Firmatario ${wallet.classicAddress} diverso da Account ${tx.Account}`)
      }
      if (!(await confirm(context))) {
        throw new Error('Firma rifiutata dall’utente')
      }
      const { hash, tx_blob } = wallet.sign(tx, false)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: wallet.classicAddress }
    },
    async signForMultisig(tx, context) {
      if (tx.SigningPubKey !== '') {
        throw new Error('La transazione multifirma deve avere SigningPubKey vuota')
      }
      if (!(await confirm(context))) {
        throw new Error('Firma parziale rifiutata dall’utente')
      }
      const { hash, tx_blob } = wallet.sign(tx, true)
      return { hash: hash.toUpperCase(), tx_blob, signerAddress: wallet.classicAddress }
    },
  }
}
