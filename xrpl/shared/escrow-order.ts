/** Vista dei termini che il verificatore dell’accordo consegna al modulo escrow. */
export interface EscrowOrder {
  readonly orderId: string
  readonly agreementHash: string
  readonly network: 'testnet'
  readonly bob: string
  readonly alice: string
  readonly oracle: string
  readonly amountDrops: string
  readonly condition: string
  /** Istanti UTC ISO 8601 con precisione al secondo. */
  readonly fundBy: string
  readonly deliverBy: string
}

export interface EscrowDepositOrder extends EscrowOrder {
  /** Hash di EscrowCreate già associato all’ordine dal firmatario o dall’API. */
  readonly createHash: string
}
