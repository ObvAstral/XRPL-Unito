import {
  Client,
  RippledError,
  hashes,
  isDeletedNode,
  isModifiedNode,
  type AccountInfoRequest,
  type AccountInfoResponse,
  type AccountObjectsRequest,
  type AccountObjectsResponse,
  type AccountSet,
  type EscrowCreate,
  type EscrowFinish,
  type LedgerEntry,
  type LedgerEntryJsonResponse,
  type LedgerEntryRequest,
  type Payment,
  type ServerStateRequest,
  type ServerStateResponse,
  type SignerListSet,
  type SubmittableTransaction,
  type Transaction,
  type TransactionMetadata,
} from 'xrpl'
import type {
  DepositReceipt,
  PaymentReceipt,
  ReleaseReceipt,
  RentalDepositOrder,
  RentalPaymentOrder,
} from '../shared/escrow-order.js'
import {
  AMENDMENTS_LEDGER_ENTRY_ID,
  LSF_DISABLE_MASTER,
  NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  RIPPLE_EPOCH_SECONDS,
  TF_PARTIAL_PAYMENT,
  buildEscrowCreate,
  canonicalSignerAddresses,
  isHash,
  normalizeHash,
  validateRentalOrder,
} from './protocol.js'

const TESTNET = {
  ripple: 'wss://s.altnet.rippletest.net:51233',
  xrplLabs: 'wss://testnet.xrpl-labs.com',
} as const

export type ManagedTransaction =
  | EscrowCreate
  | EscrowFinish
  | Payment
  | SignerListSet
  | AccountSet

export interface ValidatedLedger {
  readonly hash: string
  readonly index: number
  readonly closeTime: number
}

export interface ValidatedTransaction {
  readonly hash: string
  readonly ledgerHash: string
  readonly ledgerIndex: number
  readonly closeTime?: number
  readonly transaction: Transaction
  readonly metadata: TransactionMetadata
}

export interface LedgerReserves {
  readonly reserveBaseDrops: bigint
  readonly reserveIncDrops: bigint
  readonly baseFeeDrops: bigint
}

export type VaultInspectionState =
  | 'not_found'
  | 'needs_funding'
  | 'needs_signer_list'
  | 'needs_disable_master'
  | 'ready'
  | 'mismatch'

export interface VaultInspection {
  readonly state: VaultInspectionState
  readonly address: string
  readonly balanceDrops: bigint
  readonly spendableDrops: bigint
  readonly masterDisabled: boolean
  readonly signerListConfigured: boolean
  readonly reason?: string
}

export type OrderEscrowStatus =
  | { readonly state: 'missing' | 'mismatch' | 'pending' }
  | { readonly state: 'locked' | 'releasable'; readonly deposit: DepositReceipt }
  | { readonly state: 'credited_to_vault'; readonly deposit: DepositReceipt; readonly release: ReleaseReceipt }

export class LedgerUnavailable extends Error {
  constructor(message = 'LEDGER_UNAVAILABLE') {
    super(message)
    this.name = 'LedgerUnavailable'
  }
}

export class VaultConfigMismatchError extends Error {
  constructor(
    public readonly vaultAddress: string,
    public readonly reason: string,
  ) {
    super(`VAULT_CONFIG_MISMATCH (${vaultAddress}): ${reason}`)
    this.name = 'VaultConfigMismatchError'
  }
}

function rippleError(error: unknown): { error?: string; searched_all?: boolean } {
  if (error instanceof RippledError && typeof error.data === 'object' && error.data !== null) {
    return error.data as { error?: string; searched_all?: boolean }
  }
  return {}
}

function matchingEscrowTerms(
  actual: {
    readonly Account?: string
    readonly Destination?: string
    readonly Amount?: unknown
    readonly FinishAfter?: number
    readonly CancelAfter?: number
    readonly Condition?: string
  },
  expected: EscrowCreate,
): boolean {
  return (
    actual.Account === expected.Account &&
    actual.Destination === expected.Destination &&
    actual.Amount === expected.Amount &&
    actual.FinishAfter === expected.FinishAfter &&
    actual.Condition === undefined &&
    actual.CancelAfter === undefined
  )
}

function readDeliveredDrops(meta: TransactionMetadata): string | undefined {
  const raw = meta.delivered_amount ?? meta.DeliveredAmount
  return typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? raw : undefined
}

export type LookupResult =
  | { readonly state: 'found'; readonly tx: ValidatedTransaction }
  | { readonly state: 'unvalidated' }
  | { readonly state: 'missing'; readonly searchedAll: boolean }

export type RpcClient = Pick<Client, 'request' | 'autofill'> & {
  fundWallet?: Client['fundWallet']
}

export class EscrowLedger {
  constructor(
    private readonly client: RpcClient,
    public readonly nowMillis: () => number = () => Date.now(),
  ) {}

  async snapshot(ledgerHash?: string): Promise<ValidatedLedger> {
    try {
      const { result } = await this.client.request({
        command: 'ledger',
        api_version: 2,
        ...(ledgerHash ? { ledger_hash: normalizeHash(ledgerHash) } : { ledger_index: 'validated' }),
      })
      const { ledger_hash: hash, ledger_index: index, validated, ledger } = result
      const closeTime = ledger.close_time
      const age = Math.floor(this.nowMillis() / 1000) - RIPPLE_EPOCH_SECONDS - closeTime
      if (
        validated !== true ||
        !isHash(hash) ||
        !Number.isInteger(index) ||
        index < 1 ||
        !Number.isInteger(closeTime) ||
        age > 30 ||
        age < -10 ||
        (ledgerHash && hash.toUpperCase() !== ledgerHash.toUpperCase())
      ) {
        throw new LedgerUnavailable()
      }
      return { hash: hash.toUpperCase(), index, closeTime }
    } catch (error) {
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async ledgerHashAtIndex(ledgerIndex: number): Promise<string> {
    try {
      const { result } = await this.client.request({
        command: 'ledger',
        api_version: 2,
        ledger_index: ledgerIndex,
      })
      if (result.validated !== true || !isHash(result.ledger_hash) || result.ledger_index !== ledgerIndex) {
        throw new LedgerUnavailable()
      }
      return result.ledger_hash.toUpperCase()
    } catch {
      throw new LedgerUnavailable()
    }
  }

  async readReserves(): Promise<LedgerReserves> {
    try {
      const { result } = await this.client.request<ServerStateRequest, 2, ServerStateResponse>({
        command: 'server_state',
        api_version: 2,
      })
      const validated = result.state.validated_ledger
      if (
        !validated ||
        !Number.isInteger(validated.reserve_base) ||
        validated.reserve_base < 0 ||
        !Number.isInteger(validated.reserve_inc) ||
        validated.reserve_inc < 0 ||
        !Number.isInteger(validated.base_fee) ||
        validated.base_fee < 1
      ) {
        throw new LedgerUnavailable()
      }
      return {
        reserveBaseDrops: BigInt(validated.reserve_base),
        reserveIncDrops: BigInt(validated.reserve_inc),
        baseFeeDrops: BigInt(validated.base_fee),
      }
    } catch (error) {
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async isAmendmentEnabled(
    snapshot: ValidatedLedger,
    amendmentId = NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  ): Promise<boolean> {
    const target = normalizeHash(amendmentId, 'Amendment ID')
    try {
      const { result } = await this.client.request<
        LedgerEntryRequest,
        2,
        LedgerEntryJsonResponse<LedgerEntry.Amendments>
      >({
        command: 'ledger_entry',
        api_version: 2,
        ledger_hash: snapshot.hash,
        index: AMENDMENTS_LEDGER_ENTRY_ID,
      })
      if (result.validated !== true || result.node?.LedgerEntryType !== 'Amendments') {
        throw new LedgerUnavailable()
      }
      const enabled = result.node.Amendments ?? []
      return enabled.some((id) => typeof id === 'string' && id.toUpperCase() === target)
    } catch (error) {
      if (rippleError(error).error === 'entryNotFound') return false
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async accountBalanceDrops(account: string, snapshot: ValidatedLedger): Promise<bigint | null> {
    try {
      const { result } = await this.client.request<AccountInfoRequest, 2, AccountInfoResponse>({
        command: 'account_info',
        api_version: 2,
        account,
        ledger_hash: snapshot.hash,
      })
      if (result.validated !== true || result.account_data?.Account !== account) {
        throw new LedgerUnavailable()
      }
      return BigInt(result.account_data.Balance)
    } catch (error) {
      if (rippleError(error).error === 'actNotFound') return null
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async inspectVaultAccount(
    vaultAddress: string,
    expectedSigners: readonly [string, string, string],
    reserves: LedgerReserves,
    minSpendableDrops: bigint,
    snapshot: ValidatedLedger,
  ): Promise<VaultInspection> {
    const canonicalExpected = canonicalSignerAddresses(expectedSigners)
    let accountResult: AccountInfoResponse['result']
    try {
      const { result } = await this.client.request<AccountInfoRequest, 2, AccountInfoResponse>({
        command: 'account_info',
        api_version: 2,
        account: vaultAddress,
        signer_lists: true,
        ledger_hash: snapshot.hash,
      })
      if (result.validated !== true || result.account_data?.Account !== vaultAddress) {
        throw new LedgerUnavailable()
      }
      accountResult = result
    } catch (error) {
      if (rippleError(error).error === 'actNotFound') {
        return {
          state: 'not_found',
          address: vaultAddress,
          balanceDrops: 0n,
          spendableDrops: 0n,
          masterDisabled: false,
          signerListConfigured: false,
        }
      }
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }

    const accountData = accountResult.account_data
    const balanceDrops = BigInt(accountData.Balance)
    const masterDisabled = (accountData.Flags & LSF_DISABLE_MASTER) !== 0
    const signerLists =
      accountResult.signer_lists ??
      (accountData as AccountInfoResponse['result']['account_data'] & {
        signer_lists?: LedgerEntry.SignerList[]
      }).signer_lists ??
      []

    const ownerObjectsAfterSetup = BigInt(Math.max(accountData.OwnerCount, 1))
    const requiredReserveDrops =
      reserves.reserveBaseDrops + ownerObjectsAfterSetup * reserves.reserveIncDrops
    const spendableDrops =
      balanceDrops > requiredReserveDrops ? balanceDrops - requiredReserveDrops : 0n

    if (typeof accountData.RegularKey === 'string') {
      return {
        state: 'mismatch',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled,
        signerListConfigured: false,
        reason: 'RegularKey individuale presente sul vault',
      }
    }

    const hasDelegate = await this.hasDelegateObjects(vaultAddress, snapshot)
    if (hasDelegate) {
      return {
        state: 'mismatch',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled,
        signerListConfigured: false,
        reason: 'Oggetto Delegate presente sul vault',
      }
    }

    let signerListConfigured = false
    if (signerLists.length > 1) {
      return {
        state: 'mismatch',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled,
        signerListConfigured: false,
        reason: 'Piu’ SignerList rilevate sul vault',
      }
    }

    if (signerLists.length === 1) {
      const list = signerLists[0]!
      const entries = list.SignerEntries ?? []
      const actualAccounts = entries.map((e) => e.SignerEntry.Account).sort()
      const weightsAllOne = entries.every((e) => e.SignerEntry.SignerWeight === 1)
      const matchesExpected =
        list.SignerQuorum === 2 &&
        entries.length === 3 &&
        weightsAllOne &&
        actualAccounts.every((addr, idx) => addr === canonicalExpected[idx])
      if (!matchesExpected) {
        return {
          state: 'mismatch',
          address: vaultAddress,
          balanceDrops,
          spendableDrops,
          masterDisabled,
          signerListConfigured: false,
          reason: 'SignerList registrata diversa dai tre firmatari attesi (Quorum 2, pesi 1/1/1)',
        }
      }
      signerListConfigured = true
    } else if (masterDisabled) {
      return {
        state: 'mismatch',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled: true,
        signerListConfigured: false,
        reason: 'Master key disabilitata senza SignerList registrata',
      }
    }

    if (spendableDrops < minSpendableDrops) {
      return {
        state: 'needs_funding',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled,
        signerListConfigured,
      }
    }
    if (!signerListConfigured) {
      return {
        state: 'needs_signer_list',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled,
        signerListConfigured: false,
      }
    }
    if (!masterDisabled) {
      return {
        state: 'needs_disable_master',
        address: vaultAddress,
        balanceDrops,
        spendableDrops,
        masterDisabled: false,
        signerListConfigured: true,
      }
    }
    return {
      state: 'ready',
      address: vaultAddress,
      balanceDrops,
      spendableDrops,
      masterDisabled: true,
      signerListConfigured: true,
    }
  }

  async assertVaultReadyForOrder(
    order: RentalPaymentOrder,
    snapshot: ValidatedLedger,
  ): Promise<VaultInspection> {
    validateRentalOrder(order)
    const reserves = await this.readReserves()
    // Almeno 3 volte la fee base per sostenere il futuro Payment 2-su-3.
    const minSpendable = reserves.baseFeeDrops * 3n
    const inspection = await this.inspectVaultAccount(
      order.vault,
      [order.alice, order.bob, order.authority],
      reserves,
      minSpendable,
      snapshot,
    )
    if (inspection.state === 'mismatch') {
      throw new VaultConfigMismatchError(order.vault, inspection.reason ?? 'Configurazione incoerente')
    }
    if (inspection.state !== 'ready') {
      throw new Error(`Vault ${order.vault} non pronto (stato: ${inspection.state})`)
    }
    return inspection
  }

  private async hasDelegateObjects(vaultAddress: string, snapshot: ValidatedLedger): Promise<boolean> {
    try {
      const { result } = await this.client.request<AccountObjectsRequest, 2, AccountObjectsResponse>({
        command: 'account_objects',
        api_version: 2,
        account: vaultAddress,
        type: 'delegate',
        ledger_hash: snapshot.hash,
      })
      if (result.validated !== true) throw new LedgerUnavailable()
      return Array.isArray(result.account_objects) && result.account_objects.length > 0
    } catch (error) {
      const code = rippleError(error).error
      // Nodi che non espongono ancora il filtro 'delegate' rispondono invalidParams.
      if (code === 'invalidParams') return false
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async lookup(hash: string, range?: { min: number; max: number }): Promise<LookupResult> {
    const normalized = normalizeHash(hash)
    try {
      const { result } = await this.client.request({
        command: 'tx',
        api_version: 2,
        binary: false,
        transaction: normalized,
        ...(range && { min_ledger: range.min, max_ledger: range.max }),
      })
      if (result.validated !== true) return { state: 'unvalidated' }
      if (
        result.hash?.toUpperCase() !== normalized ||
        typeof result.ledger_index !== 'number' ||
        !result.meta ||
        typeof result.meta === 'string' ||
        typeof result.meta.TransactionResult !== 'string' ||
        !result.tx_json
      ) {
        throw new LedgerUnavailable()
      }
      const rawLedgerHash = (result as { readonly ledger_hash?: unknown }).ledger_hash
      const ledgerHash = isHash(rawLedgerHash)
        ? rawLedgerHash.toUpperCase()
        : await this.ledgerHashAtIndex(result.ledger_index)
      const date = result.tx_json.date
      const closeTime =
        (typeof date === 'number' ? date : result.date) ??
        (Date.parse(result.close_time_iso ?? '') / 1000 - RIPPLE_EPOCH_SECONDS)
      return {
        state: 'found',
        tx: {
          hash: normalized,
          ledgerHash,
          ledgerIndex: result.ledger_index,
          closeTime,
          transaction: result.tx_json,
          metadata: result.meta,
        },
      }
    } catch (error) {
      const rpc = rippleError(error)
      if (rpc.error === 'txnNotFound') {
        return { state: 'missing', searchedAll: rpc.searched_all === true }
      }
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  async verifyEscrow(order: RentalPaymentOrder, ledgerHash?: string): Promise<OrderEscrowStatus> {
    const snapshot = await this.snapshot(ledgerHash)
    if (order.createHash == null) return { state: 'missing' }
    return this.verifyEscrowAt({ ...order, createHash: order.createHash }, snapshot)
  }

  async verifyEscrowAt(
    order: RentalDepositOrder,
    snapshot: ValidatedLedger,
  ): Promise<OrderEscrowStatus> {
    const expected = buildEscrowCreate(order)
    const { checkoutBy, finishAfter } = validateRentalOrder(order)
    const createHash = normalizeHash(order.createHash, 'createHash')

    const creation = await this.lookup(createHash)
    if (creation.state !== 'found' || creation.tx.ledgerIndex > snapshot.index) {
      return { state: 'pending' }
    }

    const { transaction, metadata, ledgerIndex, ledgerHash, hash, closeTime } = creation.tx
    if (
      transaction.TransactionType !== 'EscrowCreate' ||
      metadata.TransactionResult !== 'tesSUCCESS' ||
      !matchingEscrowTerms(transaction, expected) ||
      !transaction.Sequence ||
      transaction.TicketSequence != null ||
      transaction.Delegate != null
    ) {
      return { state: 'mismatch' }
    }
    if (closeTime == null || !Number.isInteger(closeTime)) {
      throw new LedgerUnavailable()
    }
    if (closeTime > checkoutBy) {
      return { state: 'mismatch' }
    }

    const owner = order.bob
    const sequence = transaction.Sequence
    const escrowObjectId = hashes.hashEscrow(owner, sequence).toUpperCase()
    const deposit: DepositReceipt = {
      txHash: hash,
      ledgerHash,
      ledgerIndex,
      owner,
      destination: order.vault,
      amountDrops: order.netDrops,
      finishAfter,
      sequence,
      escrowObjectId,
    }

    const node = await this.escrowEntry(escrowObjectId, snapshot)
    if (node) {
      if (!matchingEscrowTerms(node, expected)) return { state: 'mismatch' }
      return {
        state: snapshot.closeTime > finishAfter ? 'releasable' : 'locked',
        deposit,
      }
    }

    return this.findEscrowRelease(order, deposit, snapshot)
  }

  private async escrowEntry(
    objectId: string,
    snapshot: ValidatedLedger,
  ): Promise<LedgerEntry.Escrow | undefined> {
    try {
      const { result } = await this.client.request<
        LedgerEntryRequest,
        2,
        LedgerEntryJsonResponse<LedgerEntry.Escrow>
      >({
        command: 'ledger_entry',
        api_version: 2,
        ledger_hash: snapshot.hash,
        escrow: objectId,
      })
      if (
        result.validated !== true ||
        result.index.toUpperCase() !== objectId.toUpperCase() ||
        result.node?.LedgerEntryType !== 'Escrow'
      ) {
        throw new LedgerUnavailable()
      }
      return result.node
    } catch (error) {
      if (rippleError(error).error === 'entryNotFound') return undefined
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  private async findEscrowRelease(
    order: RentalPaymentOrder,
    deposit: DepositReceipt,
    snapshot: ValidatedLedger,
  ): Promise<OrderEscrowStatus> {
    let marker: unknown
    try {
      do {
        const { result } = await this.client.request({
          command: 'account_tx',
          api_version: 2,
          account: deposit.owner,
          binary: false,
          ledger_index_min: deposit.ledgerIndex,
          ledger_index_max: snapshot.index,
          marker,
        })
        for (const item of result.transactions) {
          const tx = item.tx_json
          if (
            item.validated !== true ||
            !isHash(item.hash) ||
            !tx ||
            !item.meta ||
            typeof item.meta === 'string' ||
            item.meta.TransactionResult !== 'tesSUCCESS' ||
            item.ledger_index < deposit.ledgerIndex ||
            item.ledger_index > snapshot.index ||
            tx.TransactionType !== 'EscrowFinish' ||
            tx.Owner !== deposit.owner ||
            tx.OfferSequence !== deposit.sequence
          ) {
            continue
          }
          const consumed = item.meta.AffectedNodes.some(
            (node) =>
              isDeletedNode(node) &&
              node.DeletedNode.LedgerEntryType === 'Escrow' &&
              node.DeletedNode.LedgerIndex.toUpperCase() === deposit.escrowObjectId &&
              node.DeletedNode.FinalFields.Destination === order.vault &&
              node.DeletedNode.FinalFields.Amount === order.netDrops,
          )
          if (consumed) {
            const rawItemHash = (item as { readonly ledger_hash?: unknown }).ledger_hash
            const releaseLedgerHash = isHash(rawItemHash)
              ? rawItemHash.toUpperCase()
              : await this.ledgerHashAtIndex(item.ledger_index)
            return {
              state: 'credited_to_vault',
              deposit,
              release: {
                txHash: item.hash.toUpperCase(),
                ledgerHash: releaseLedgerHash,
                ledgerIndex: item.ledger_index,
                vault: order.vault,
                amountDrops: order.netDrops,
                deposit,
              },
            }
          }
        }
        marker = result.marker
      } while (marker != null)
    } catch {
      // L'assenza dell'oggetto senza prova di EscrowFinish non basta a certificare l'accredito.
    }
    return { state: 'pending' }
  }

  /**
   * Verifica che sul ledger non esista alcun oggetto Escrow attivo di Bob
   * compatibile con (vault, netDrops, FinishAfter) il cui hash non sia stato registrato.
   */
  async hasMatchingActiveEscrowFromBob(
    order: RentalPaymentOrder,
    snapshot: ValidatedLedger,
  ): Promise<boolean> {
    const expected = buildEscrowCreate(order)
    let marker: unknown
    try {
      do {
        const { result } = await this.client.request<AccountObjectsRequest, 2, AccountObjectsResponse>({
          command: 'account_objects',
          api_version: 2,
          account: order.bob,
          type: 'escrow',
          ledger_hash: snapshot.hash,
          marker,
        })
        if (result.validated !== true) throw new LedgerUnavailable()
        for (const entry of result.account_objects) {
          if (entry.LedgerEntryType !== 'Escrow') continue
          if (matchingEscrowTerms(entry, expected)) {
            return true
          }
        }
        marker = result.marker
      } while (marker != null)
      return false
    } catch (error) {
      if (rippleError(error).error === 'actNotFound') return false
      if (error instanceof LedgerUnavailable) throw error
      throw new LedgerUnavailable()
    }
  }

  /**
   * Verifica sul ledger validato che Bob abbia davvero accettato l'offerta del pass
   * accreditando feeDrops all'ente emittente (prerequisito per il rimborso fee).
   */
  async verifyPassFeeCollected(
    order: RentalPaymentOrder,
    acceptOfferHash: string,
    snapshot: ValidatedLedger,
  ): Promise<boolean> {
    validateRentalOrder(order)
    const lookup = await this.lookup(acceptOfferHash)
    if (lookup.state !== 'found' || lookup.tx.ledgerIndex > snapshot.index) {
      return false
    }
    const { transaction, metadata } = lookup.tx
    if (
      transaction.TransactionType !== 'NFTokenAcceptOffer' ||
      transaction.Account !== order.bob ||
      metadata.TransactionResult !== 'tesSUCCESS'
    ) {
      return false
    }
    if (
      order.offerId !== undefined &&
      transaction.NFTokenSellOffer?.toUpperCase() !== normalizeHash(order.offerId, 'offerId')
    ) {
      return false
    }

    const expectedOfferId = order.offerId ? normalizeHash(order.offerId, 'offerId') : undefined
    const expectedPassId = order.passNftId ? normalizeHash(order.passNftId, 'passNftId') : undefined

    const deletedMatchingOffer = metadata.AffectedNodes.some((node) => {
      if (!isDeletedNode(node) || node.DeletedNode.LedgerEntryType !== 'NFTokenOffer') {
        return false
      }
      if (expectedOfferId && node.DeletedNode.LedgerIndex.toUpperCase() !== expectedOfferId) {
        return false
      }
      const fields = node.DeletedNode.FinalFields
      if (
        fields.Owner !== order.authority ||
        fields.Destination !== order.bob ||
        fields.Amount !== order.feeDrops
      ) {
        return false
      }
      if (
        expectedPassId &&
        (typeof fields.NFTokenID !== 'string' || fields.NFTokenID.toUpperCase() !== expectedPassId)
      ) {
        return false
      }
      return true
    })
    if (!deletedMatchingOffer) return false

    const authorityModified = metadata.AffectedNodes.find(
      (node) =>
        isModifiedNode(node) &&
        node.ModifiedNode.LedgerEntryType === 'AccountRoot' &&
        node.ModifiedNode.FinalFields?.Account === order.authority,
    )
    if (authorityModified && isModifiedNode(authorityModified)) {
      const prev = authorityModified.ModifiedNode.PreviousFields?.Balance
      const next = authorityModified.ModifiedNode.FinalFields?.Balance
      if (typeof prev === 'string' && typeof next === 'string') {
        return BigInt(next) - BigInt(prev) === BigInt(order.feeDrops)
      }
    }
    return true
  }

  /**
   * Verifica che un Payment validato abbia consegnato esattamente expectedDrops al beneficiario
   * (senza partial payment).
   */
  async verifyValidatedPayment(
    hash: string,
    expectedFrom: string,
    expectedBeneficiary: string,
    expectedDrops: string,
    snapshot: ValidatedLedger,
  ): Promise<PaymentReceipt | null> {
    const lookup = await this.lookup(hash)
    if (lookup.state !== 'found' || lookup.tx.ledgerIndex > snapshot.index) {
      return null
    }
    const { transaction, metadata, ledgerHash, ledgerIndex } = lookup.tx
    if (
      transaction.TransactionType !== 'Payment' ||
      metadata.TransactionResult !== 'tesSUCCESS' ||
      transaction.Account !== expectedFrom ||
      transaction.Destination !== expectedBeneficiary ||
      transaction.Amount !== expectedDrops ||
      ((typeof transaction.Flags === 'number' ? transaction.Flags : 0) & TF_PARTIAL_PAYMENT) !== 0
    ) {
      throw new Error('Payment validato incoerente coi termini attesi')
    }

    const delivered = readDeliveredDrops(metadata)
    if (delivered !== expectedDrops) {
      throw new Error(
        `delivered_amount (${delivered ?? 'assente'}) diverso dall’importo atteso (${expectedDrops})`,
      )
    }

    const signers = transaction.Signers?.map((s) => s.Signer.Account)
    return {
      txHash: lookup.tx.hash,
      ledgerHash,
      ledgerIndex,
      from: expectedFrom,
      beneficiary: expectedBeneficiary,
      deliveredDrops: delivered,
      ...(signers && signers.length === 2
        ? { signers: [signers[0]!, signers[1]!] as const }
        : {}),
    }
  }

  async fill<T extends SubmittableTransaction>(
    transaction: T,
    snapshot: ValidatedLedger,
    options?: { readonly multisigSigners?: number; readonly ledgerWindow?: number },
  ): Promise<T> {
    const window = options?.ledgerWindow ?? 8
    const base = {
      ...transaction,
      LastLedgerSequence: snapshot.index + window,
    } as T
    try {
      if (options?.multisigSigners !== undefined) {
        return await this.client.autofill(base, options.multisigSigners)
      }
      return await this.client.autofill(base)
    } catch {
      throw new LedgerUnavailable()
    }
  }

  async broadcast(blob: string): Promise<void> {
    try {
      await this.client.request({ command: 'submit', api_version: 2, tx_blob: blob })
    } catch {
      // L'esito si determina sempre interrogando il ledger validato, mai dalla risposta di submit.
    }
  }
}

export async function connectTestnet(node: keyof typeof TESTNET = 'ripple') {
  const endpoint = TESTNET[node]
  if (typeof endpoint !== 'string') throw new Error('Nodo Testnet sconosciuto')
  const client = new Client(endpoint, {
    timeout: 10_000,
    connectionTimeout: 10_000,
    maxFeeXRP: '0.02',
  })
  await client.connect()
  return { client, ledger: new EscrowLedger(client) }
}
