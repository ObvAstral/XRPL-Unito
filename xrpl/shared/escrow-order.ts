export type VaultScenario = 'cad' | 'billboard'

/**
 * Modalita' di liquidazione del saldo maturato nel vault 2 su 3:
 * - ordinary: pagamento ad Alice con due firme tra Alice, Bob ed ente competente
 * - arbitration_alice: contestazione vinta da Alice -> firme Ente + Alice -> beneficiario Alice
 * - arbitration_bob: contestazione vinta da Bob -> firme Ente + Bob -> beneficiario Bob
 * - inadmissible_refund: ordine risultato inammissibile con netto gia' bloccato -> 2 firme tra {Alice, Bob, Ente} -> beneficiario Bob
 */
export type VaultResolutionMode =
  | 'ordinary'
  | 'arbitration_alice'
  | 'arbitration_bob'
  | 'inadmissible_refund'

/** Termini finanziari v2 di un ordine di affitto condivisi tra accordi (A), pagamenti (B) e backend (C). */
export interface RentalPaymentOrder {
  readonly orderId: string
  readonly agreementHash: string
  readonly scenario: VaultScenario
  readonly network: 'testnet'
  readonly alice: string
  readonly bob: string
  /** Indirizzo classico XRPL dell'ente competente (fornitore CAD o Comune simulato). */
  readonly authority: string
  /** Indirizzo classico XRPL del vault 2-su-3 prefinanziato per lo scenario. */
  readonly vault: string
  /** Prezzo lordo totale in drops interi (es. "10000000" per 10 XRP). */
  readonly grossDrops: string
  /** Percentuale commerciale dell'ente in punti base interi (es. 1000 per 10%). */
  readonly feeBps: number
  /** Quota immediata dell'ente alla consegna del pass in drops interi (es. "1000000"). */
  readonly feeDrops: string
  /** Quota netta bloccata nell'escrow per il vault in drops interi (es. "9000000"). */
  readonly netDrops: string
  /** Termine massimo UTC ISO 8601 al secondo entro cui completare consegna pass e deposito escrow. */
  readonly checkoutDeadline: string
  /** Inizio periodo d'uso UTC ISO 8601 al secondo. */
  readonly startAt: string
  /** Fine periodo d'uso UTC ISO 8601 al secondo; coincide con FinishAfter dell'escrow temporale. */
  readonly endAt: string
  /** Dati del pass NFT (forniti da A/C) necessari per verificare l'effettivo incasso della fee prima di un rimborso. */
  readonly passNftId?: string
  readonly offerId?: string
  readonly acceptOfferHash?: string
  /** Hash di EscrowCreate associato all'ordine non appena inviato o validato. */
  readonly createHash?: string
}

export interface RentalDepositOrder extends RentalPaymentOrder {
  readonly createHash: string
}

export interface RentalAmountSplit {
  readonly grossDrops: string
  readonly feeBps: number
  readonly feeDrops: string
  readonly netDrops: string
}

export interface DepositReceipt {
  readonly txHash: string
  readonly ledgerHash: string
  readonly ledgerIndex: number
  readonly owner: string
  readonly destination: string
  readonly amountDrops: string
  readonly finishAfter: number
  readonly sequence: number
  readonly escrowObjectId: string
}

export interface ReleaseReceipt {
  readonly txHash: string
  readonly ledgerHash: string
  readonly ledgerIndex: number
  readonly vault: string
  readonly amountDrops: string
  readonly deposit: DepositReceipt
}

export interface PaymentReceipt {
  readonly txHash: string
  readonly ledgerHash: string
  readonly ledgerIndex: number
  readonly from: string
  readonly beneficiary: string
  readonly deliveredDrops: string
  readonly signers?: readonly [string, string]
}

export interface VaultPublicConfig {
  readonly scenario: VaultScenario
  readonly address: string
  readonly signers: readonly [string, string, string]
  readonly quorum: 2
  readonly masterDisabled: true
  readonly spendableDrops: string
}

export interface TestnetCapabilities {
  readonly nftokenMintOfferEnabled: boolean
  readonly nftokenMintOfferAmendmentId: string
  readonly checkedLedgerHash: string
  readonly checkedLedgerIndex: number
  readonly reserveBaseDrops: string
  readonly reserveIncDrops: string
}

export interface PublicSetupOutput {
  readonly network: 'testnet'
  readonly participants: {
    readonly alice: string
    readonly bob: string
    readonly cadAuthority: string
    readonly billboardAuthority: string
    readonly operator: string
  }
  readonly vaults: {
    readonly cad: VaultPublicConfig
    readonly billboard: VaultPublicConfig
  }
  readonly capabilities: TestnetCapabilities
}
