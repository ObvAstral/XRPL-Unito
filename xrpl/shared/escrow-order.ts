export type VaultScenario = 'cad' | 'billboard'

/**
 * Settlement mode for matured balance in the 2-of-3 vault:
 * - ordinary: payment to Alice with two signatures among Alice, Bob, and competent authority
 * - arbitration_alice: dispute won by Alice -> Authority + Alice signatures -> beneficiary Alice
 * - arbitration_bob: dispute won by Bob -> Authority + Bob signatures -> beneficiary Bob
 * - inadmissible_refund: order found inadmissible with net already locked -> 2 signatures among {Alice, Bob, Authority} -> beneficiary Bob
 */
export type VaultResolutionMode =
  | 'ordinary'
  | 'arbitration_alice'
  | 'arbitration_bob'
  | 'inadmissible_refund'

/** v2 financial terms of a rental order shared across agreements (A), payments (B), and backend (C). */
export interface RentalPaymentOrder {
  readonly orderId: string
  readonly agreementHash: string
  readonly scenario: VaultScenario
  readonly network: 'testnet'
  readonly alice: string
  readonly bob: string
  /** Classic XRPL address of the competent authority (CAD provider or simulated Municipality). */
  readonly authority: string
  /** Classic XRPL address of the pre-funded 2-of-3 vault for the scenario. */
  readonly vault: string
  /** Total gross price in integer drops (e.g. "10000000" for 10 XRP). */
  readonly grossDrops: string
  /** Authority commercial fee percentage in integer basis points (e.g. 1000 for 10%). */
  readonly feeBps: number
  /** Immediate authority share on pass delivery in integer drops (e.g. "1000000"). */
  readonly feeDrops: string
  /** Net share locked in escrow for the vault in integer drops (e.g. "9000000"). */
  readonly netDrops: string
  /** Maximum UTC ISO 8601 second-precision deadline to complete pass delivery and escrow deposit. */
  readonly checkoutDeadline: string
  /** Usage period start in UTC ISO 8601 at second precision. */
  readonly startAt: string
  /** Usage period end in UTC ISO 8601 at second precision; matches Escrow FinishAfter. */
  readonly endAt: string
  /** NFT pass data (supplied by A/C) needed to verify actual fee collection before a refund. */
  readonly passNftId?: string
  readonly offerId?: string
  readonly acceptOfferHash?: string
  /** EscrowCreate transaction hash associated with the order once submitted or validated. */
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
