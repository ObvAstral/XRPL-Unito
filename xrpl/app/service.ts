import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  digestTerms,
  readOrder,
  readProposal,
  signOrder,
  signProposal,
  verifyRental,
  type RentalBundle,
  type RentalProposal,
  type SignedOrder,
  type SignedProposal,
} from '../agreement/rental.js'
import { WalletLogin, signLogin, type LoginChallenge } from '../agreement/wallet-login.js'
import { verifyWalletSignature, type LocalSigner } from '../agreement/wallet.js'
import { LedgerUnavailable, type OrderEscrowStatus, type ValidatedLedger } from '../escrow/ledger.js'
import { resolveVaultSettlement, splitRentalAmount } from '../escrow/protocol.js'
import type { VaultPayoutProgress } from '../escrow/service.js'
import { rippleTime } from '../nft/pass.js'
import { verifyRentalPass, verifyRentalTitle } from '../nft/rental.js'
import {
  SIMULATED_PRESETS,
  createSampleCadOrderExchange,
  formatTorinoDateTime,
  formatUtcSecond,
  normalizeCatalogResourceId,
  toRentalResource,
  toTitleTerms,
  type AccessDecisionView,
  type CatalogResourceConfig,
  type OrderLifecycleStatus,
  type SampleOrderExchange,
  type SettlementUiView,
  type SimulatedPresetName,
} from '../shared/demo-contract.js'
import type { VaultResolutionMode } from '../shared/escrow-order.js'
import { adaptLocalSigner, rentalDepositState, toPaymentOrder } from '../shared/rental-bridge.js'
import { validateAndDecodeImage } from './image-validator.js'
import {
  AppStore,
  ConflictError,
  type BillboardPublicationRecord,
  type ListingRecord,
  type ListingRevisionRecord,
  type OrderRecord,
} from './store.js'
import {
  loadInitialTitlesFile,
  saveInitialTitlesFile,
  type XrplRuntime,
} from './xrpl-runtime.js'

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export type LocalDemoRole = 'alice' | 'bob' | 'cad' | 'comune'

export interface SessionView {
  readonly authenticated: boolean
  readonly sessionRef: string
  readonly address: string | null
  readonly role: 'alice' | 'bob' | 'authority' | 'guest'
  readonly authorityScenario?: 'cad' | 'billboard'
}

export interface OrderView {
  readonly orderId: string
  readonly listingId: string
  readonly revision: number
  readonly resourceId: string
  readonly resourceName: string
  readonly scenario: 'cad' | 'billboard'
  readonly alice: string
  readonly bob: string
  readonly issuer: string
  readonly authorityName: string
  readonly vault: string
  readonly startsAt: string
  readonly endsAt: string
  readonly fundBy: string
  readonly startsAtTorino: string
  readonly endsAtTorino: string
  readonly fundByTorino: string
  readonly priceDrops: string
  readonly feeBps: number
  readonly feeDrops: string
  readonly netDrops: string
  readonly proposalHash: string
  readonly agreementHash: string
  readonly status: OrderLifecycleStatus
  readonly statusLabel: string
  readonly rejectionReason: string | null
  readonly pendingStep: string | null
  readonly nextSigner: string | null
  readonly nextActionLabel: string
  readonly calendarHeld: boolean
  readonly vaultHeld: boolean
  readonly receipts: {
    readonly passNftId: string | null
    readonly offerId: string | null
    readonly mintTxHash: string | null
    readonly mintLedgerHash: string | null
    readonly mintLedgerIndex: number | null
    readonly offerTxHash: string | null
    readonly offerLedgerHash: string | null
    readonly offerLedgerIndex: number | null
    readonly acceptOfferHash: string | null
    readonly acceptLedgerHash: string | null
    readonly acceptLedgerIndex: number | null
    readonly createHash: string | null
    readonly escrowObjectId: string | null
    readonly escrowSequence: number | null
    readonly depositLedgerHash: string | null
    readonly depositLedgerIndex: number | null
    readonly releaseTxHash: string | null
    readonly releaseLedgerHash: string | null
    readonly releaseLedgerIndex: number | null
    readonly payoutTxHash: string | null
    readonly payoutLedgerHash: string | null
    readonly payoutLedgerIndex: number | null
    readonly payoutBeneficiary: string | null
    readonly payoutDeliveredDrops: string | null
    readonly payoutResolutionMode: VaultResolutionMode | null
    readonly burnTxHash: string | null
    readonly burnLedgerHash: string | null
    readonly burnLedgerIndex: number | null
    readonly feeRefundDue: boolean | null
    readonly refundTxHash: string | null
    readonly refundLedgerHash: string | null
    readonly refundLedgerIndex: number | null
  }
  readonly settlement: SettlementUiView
}

export interface BillboardCurrentView {
  readonly resourceId: string
  readonly active: boolean
  readonly orderId: string | null
  readonly mimeType: string | null
  readonly width: number | null
  readonly height: number | null
  readonly imageUrl: string | null
  readonly expiresAtUtc: string | null
  readonly expiresAtTorino: string | null
  readonly serverNowUtc: string
}

interface AccountFundsView {
  readonly balanceDrops: string
  readonly spendableDrops: string
}

export interface ResourceFundsView {
  readonly resourceId: string
  readonly ledgerIndex: number
  readonly accounts: Readonly<Record<'alice' | 'bob' | 'vault', AccountFundsView | null>>
  readonly escrow: {
    readonly state: OrderEscrowStatus['state'] | 'not_created' | 'unavailable'
    readonly lockedDrops: string | null
    readonly creditedDrops?: string
  }
  readonly payout: { readonly beneficiary: 'alice' | 'bob'; readonly deliveredDrops: string } | null
}

export class RentalPlatformService {
  private readonly walletLogin: WalletLogin
  private readonly imagesDir: string
  private activePreset: SimulatedPresetName = 'initial_active_license'
  private presetCounter = 1

  private constructor(
    private readonly dataDir: string,
    private readonly domain: string,
    readonly runtime: XrplRuntime,
    readonly store: AppStore,
  ) {
    this.walletLogin = new WalletLogin(join(dataDir, 'login.sqlite'), domain, runtime.nowMillis)
    this.imagesDir = join(dataDir, 'billboard-images')
    mkdirSync(this.imagesDir, { recursive: true, mode: 0o700 })
  }

  static async create(options: {
    readonly dataDir: string
    readonly domain: string
    readonly runtime: XrplRuntime
  }): Promise<RentalPlatformService> {
    mkdirSync(options.dataDir, { recursive: true, mode: 0o700 })
    const store = new AppStore(options.dataDir)
    const service = new RentalPlatformService(
      options.dataDir,
      options.domain,
      options.runtime,
      store,
    )
    await service.bootstrapCatalogTitles()
    return service
  }

  close(): void {
    this.walletLogin.close()
    this.store.close()
  }

  nowUtc(): string {
    return formatUtcSecond(this.runtime.nowMillis())
  }

  private async ensureTitleOnLedger(params: {
    readonly resourceId: string
    readonly issuerSigner: LocalSigner
    readonly aliceSigner: LocalSigner
    readonly validFrom: string
    readonly validTo: string
    readonly existingTitleNftId?: string
  }): Promise<string> {
    const terms = {
      resourceId: params.resourceId,
      issuer: params.issuerSigner.classicAddress,
      alice: params.aliceSigner.classicAddress,
      validFrom: params.validFrom,
      validTo: params.validTo,
    }
    if (params.existingTitleNftId) {
      const snap = await this.runtime.escrowLedger.snapshot()
      const status = await verifyRentalTitle(
        this.runtime.nftRpc,
        {
          ...terms,
          titleNftId: params.existingTitleNftId,
          vault:
            params.resourceId === 'cad'
              ? this.runtime.setup.vaults.cad.address
              : this.runtime.setup.vaults.billboard.address,
        },
        snap.hash,
      )
      if (status === 'present') {
        return params.existingTitleNftId
      }
    }

    const issued = await this.runtime.rentalNfts.issueTitle(terms, {
      signer: params.issuerSigner,
      confirm: async () => true,
    })
    if (issued.status !== 'validated') {
      throw new Error(`Initial title issuance failed for ${params.resourceId}: ${issued.status}`)
    }
    const accepted = await this.runtime.rentalNfts.acceptTitle(terms, issued, {
      signer: params.aliceSigner,
      confirm: async () => true,
    })
    if (accepted.status !== 'validated') {
      throw new Error(`Initial title acceptance failed for ${params.resourceId}: ${accepted.status}`)
    }
    return issued.nftId
  }

  private async bootstrapCatalogTitles(): Promise<void> {
    const saved = loadInitialTitlesFile(this.dataDir)
    const nowSec = Math.floor(this.runtime.nowMillis() / 1000)
    const defaultFrom = formatUtcSecond((nowSec - 60) * 1000)
    const defaultTo = formatUtcSecond((nowSec + 365 * 24 * 3600) * 1000)

    const cadSaved = saved?.cad
    const cadValidFrom = cadSaved?.validFrom ?? defaultFrom
    const cadValidTo = cadSaved?.validTo ?? defaultTo
    const cadTitleNftId = await this.ensureTitleOnLedger({
      resourceId: 'cad',
      issuerSigner: this.runtime.signers.cadAuthority,
      aliceSigner: this.runtime.signers.alice,
      validFrom: cadValidFrom,
      validTo: cadValidTo,
      existingTitleNftId: cadSaved?.titleNftId,
    })

    const billboardSaved = saved?.['torino-01']
    const bbValidFrom = billboardSaved?.validFrom ?? defaultFrom
    const bbValidTo = billboardSaved?.validTo ?? defaultTo
    const bbTitleNftId = await this.ensureTitleOnLedger({
      resourceId: 'torino-01',
      issuerSigner: this.runtime.signers.billboardAuthority,
      aliceSigner: this.runtime.signers.alice,
      validFrom: bbValidFrom,
      validTo: bbValidTo,
      existingTitleNftId: billboardSaved?.titleNftId,
    })

    saveInitialTitlesFile(this.dataDir, {
      cad: { titleNftId: cadTitleNftId, validFrom: cadValidFrom, validTo: cadValidTo },
      'torino-01': { titleNftId: bbTitleNftId, validFrom: bbValidFrom, validTo: bbValidTo },
    })

    const cadConfig: CatalogResourceConfig = {
      resourceId: 'cad',
      aliases: ['cad-01'],
      displayName: 'CAD Seat · Mechanics Studio 01',
      serviceType: 'cad_portal',
      scenario: 'cad',
      authorityName: 'CAD Provider (simulated)',
      issuer: this.runtime.setup.participants.cadAuthority,
      alice: this.runtime.setup.participants.alice,
      titleNftId: cadTitleNftId,
      validFrom: cadValidFrom,
      validTo: cadValidTo,
      vault: this.runtime.setup.vaults.cad.address,
      vaultSigners: this.runtime.setup.vaults.cad.signers,
      feeBps: 1000,
    }

    const bbConfig: CatalogResourceConfig = {
      resourceId: 'torino-01',
      aliases: [],
      displayName: 'Advertising Billboard · Torino 01',
      serviceType: 'digital_billboard',
      scenario: 'billboard',
      authorityName: 'Municipality of Turin (simulated)',
      issuer: this.runtime.setup.participants.billboardAuthority,
      alice: this.runtime.setup.participants.alice,
      titleNftId: bbTitleNftId,
      validFrom: bbValidFrom,
      validTo: bbValidTo,
      vault: this.runtime.setup.vaults.billboard.address,
      vaultSigners: this.runtime.setup.vaults.billboard.signers,
      feeBps: 1000,
    }

    this.store.upsertResource(cadConfig)
    this.store.upsertResource(bbConfig)
  }

  getSignerForRole(role: LocalDemoRole): LocalSigner {
    switch (role) {
      case 'alice':
        return this.runtime.signers.alice
      case 'bob':
        return this.runtime.signers.bob
      case 'cad':
        return this.runtime.signers.cadAuthority
      case 'comune':
        return this.runtime.signers.billboardAuthority
    }
  }

  private getSignerByAddress(address: string): LocalSigner | undefined {
    const candidates = [
      this.runtime.signers.alice,
      this.runtime.signers.bob,
      this.runtime.signers.cadAuthority,
      this.runtime.signers.billboardAuthority,
      this.runtime.signers.operator,
    ]
    return candidates.find((s) => s.classicAddress === address)
  }

  resolveRoleFromAddress(address: string | null): {
    readonly role: 'alice' | 'bob' | 'authority' | 'guest'
    readonly authorityScenario?: 'cad' | 'billboard'
  } {
    if (!address) return { role: 'guest' }
    if (address === this.runtime.setup.participants.alice) return { role: 'alice' }
    if (address === this.runtime.setup.participants.bob) return { role: 'bob' }
    if (address === this.runtime.setup.participants.cadAuthority) {
      return { role: 'authority', authorityScenario: 'cad' }
    }
    if (address === this.runtime.setup.participants.billboardAuthority) {
      return { role: 'authority', authorityScenario: 'billboard' }
    }
    return { role: 'guest' }
  }

  // --- Sessions and one-time signature login ---

  createPendingSessionRef(): string {
    return randomBytes(24).toString('hex')
  }

  issueWalletChallenge(sessionRef?: string): { readonly sessionRef: string; readonly challenge: LoginChallenge } {
    const ref = sessionRef && sessionRef.trim() ? sessionRef.trim() : this.createPendingSessionRef()
    this.store.createOrRefreshPendingSession(ref, this.runtime.nowMillis())
    const challenge = this.walletLogin.issue(ref)
    return { sessionRef: ref, challenge }
  }

  verifyWalletSession(sessionRef: string, challengeId: string, proof: unknown): SessionView {
    if (!sessionRef) {
      throw new HttpError(400, 'SESSION_REF_REQUIRED', 'Missing session reference.')
    }
    const pending = this.store.getSession(sessionRef, this.runtime.nowMillis())
    if (!pending) {
      throw new HttpError(401, 'SESSION_INVALID', 'Pending session does not exist or has expired.')
    }
    let address: string
    try {
      const consumed = this.walletLogin.consume(challengeId, sessionRef, proof)
      address = consumed.address
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Login signature verification failed.'
      throw new HttpError(401, 'LOGIN_VERIFICATION_FAILED', msg)
    }
    this.store.authenticateSession(sessionRef, address, this.runtime.nowMillis())
    return this.getSessionView(sessionRef)
  }

  getSessionView(sessionRef: string | null): SessionView {
    if (!sessionRef) {
      return { authenticated: false, sessionRef: '', address: null, role: 'guest' }
    }
    const rec = this.store.getSession(sessionRef, this.runtime.nowMillis())
    if (!rec || !rec.address) {
      return { authenticated: false, sessionRef: rec?.sessionRef ?? '', address: null, role: 'guest' }
    }
    const info = this.resolveRoleFromAddress(rec.address)
    return {
      authenticated: true,
      sessionRef: rec.sessionRef,
      address: rec.address,
      role: info.role,
      ...(info.authorityScenario ? { authorityScenario: info.authorityScenario } : {}),
    }
  }

  logoutSession(sessionRef: string | null): void {
    if (sessionRef) this.store.deleteSession(sessionRef)
  }

  signLoginLocally(challenge: LoginChallenge, role: LocalDemoRole) {
    const signer = this.getSignerForRole(role)
    const proof = signLogin(challenge, this.domain, signer, this.runtime.nowMillis())
    return { id: challenge.id, proof, address: signer.classicAddress }
  }

  signProposalLocally(input: {
    readonly resourceId: string
    readonly listingId?: string
    readonly revision?: number
    readonly startsAt: string
    readonly endsAt: string
    readonly priceDrops: string
    readonly role?: LocalDemoRole
  }): SignedProposal & { readonly proposalHash: string } {
    const resource = this.requireResource(input.resourceId)
    const signer = this.getSignerForRole(input.role ?? 'alice')
    const listingId = input.listingId?.trim() || `${resource.resourceId}-${Date.now()}`
    const existing = this.store.getListing(listingId)
    const revision = input.revision ?? (existing ? existing.currentRevision + 1 : 1)
    const proposalInput: RentalProposal = {
      protocol: 'xrpl-unito:rental-proposal',
      version: 2,
      network: 'testnet',
      splitRule: 'floor-bps',
      listingId,
      revision,
      resourceId: resource.resourceId,
      titleNftId: resource.titleNftId,
      issuer: resource.issuer,
      alice: resource.alice,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      priceDrops: input.priceDrops,
      feeBps: resource.feeBps,
    }
    const signed = signProposal(proposalInput, signer)
    return { ...signed, proposalHash: digestTerms(signed.proposal) }
  }

  signOrderLocally(input: {
    readonly listingId: string
    readonly revision?: number
    readonly orderId?: string
    readonly fundBy?: string
    readonly role?: LocalDemoRole
  }): SignedOrder {
    const listing = this.store.getListing(input.listingId)
    if (!listing) throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found.')
    const rev = this.store.getListingRevision(listing.listingId, input.revision ?? listing.currentRevision)
    if (!rev) throw new HttpError(404, 'REVISION_NOT_FOUND', 'Listing revision not found.')
    const resource = this.requireResource(rev.resourceId)
    const signer = this.getSignerForRole(input.role ?? 'bob')
    const signedProposal: SignedProposal = {
      proposal: JSON.parse(rev.proposalJson) as RentalProposal,
      proof: JSON.parse(rev.proofJson),
    }
    const orderId = input.orderId?.trim() || `ord-${Date.now()}-${randomBytes(3).toString('hex')}`
    const fundBy = input.fundBy ?? rev.startsAt
    return signOrder(
      signedProposal,
      {
        protocol: 'xrpl-unito:rental-order',
        version: 2,
        network: 'testnet',
        orderId,
        proposalHash: rev.proposalHash,
        bob: signer.classicAddress,
        vault: resource.vault,
        fundBy,
      },
      signer,
    )
  }

  async signVaultPartialLocally(
    orderId: string,
    role: LocalDemoRole,
  ): Promise<{ readonly tx_blob: string; readonly hash: string; readonly signerAddress: string }> {
    const order = this.requireOrder(orderId)
    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rental = verifyRental(bundle, toRentalResource(resource))
    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      ...(order.passNftId ? { passNftId: order.passNftId } : {}),
      ...(order.offerId ? { offerId: order.offerId } : {}),
      ...(order.acceptOfferHash ? { acceptOfferHash: order.acceptOfferHash } : {}),
      ...(order.createHash ? { createHash: order.createHash } : {}),
    })
    if (!order.createHash) {
      throw new HttpError(409, 'NO_DEPOSIT', 'Escrow deposit not present for this order.')
    }
    const draft = this.runtime.attemptStore.getMultisigDraft(orderId)
    const mode = draft?.resolutionMode ?? 'ordinary'
    const progress = await this.runtime.escrowService.prepareVaultPayout(
      paymentOrder,
      order.createHash,
      mode,
    )
    if (progress.phase !== 'awaiting_signatures') {
      throw new HttpError(409, 'PAYOUT_NOT_AWAITING_SIGNATURES', `Settlement status: ${progress.phase}`)
    }
    const signer = this.getSignerForRole(role)
    const roleSigner = adaptLocalSigner(signer)
    return roleSigner.signForMultisig(progress.preparedTransaction, {
      orderId,
      action: 'vault_payout',
      feeDrops: progress.feeDrops,
      summary: {
        vault: progress.vault,
        beneficiary: progress.beneficiary,
        amountDrops: progress.amountDrops,
        resolutionMode: progress.resolutionMode,
      },
    })
  }

  // --- Catalog, Listings, and Orders ---

  requireResource(rawId: string): CatalogResourceConfig {
    const normalized = normalizeCatalogResourceId(rawId)
    const resource = this.store.getResource(normalized) ?? this.store.getResource(rawId)
    if (!resource) {
      throw new HttpError(404, 'RESOURCE_NOT_FOUND', `Unknown resource: ${rawId}`)
    }
    return resource
  }

  requireOrder(orderId: string): OrderRecord {
    const order = this.store.getOrder(orderId)
    if (!order) {
      throw new HttpError(404, 'ORDER_NOT_FOUND', `Order not found: ${orderId}`)
    }
    return order
  }

  listResources(): CatalogResourceConfig[] {
    return this.store.listResources()
  }

  async getResourceFunds(sessionRef: string | null, resourceId: string): Promise<ResourceFundsView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect your wallet to view balances.')
    }
    const resource = this.requireResource(resourceId)
    const bobAddress = this.runtime.setup.participants.bob
    if (![resource.alice, bobAddress, resource.issuer].includes(session.address)) {
      throw new HttpError(403, 'FORBIDDEN_FUNDS', 'The connected wallet is not a participant for this resource.')
    }

    const orders = this.store.listOrders(resource.resourceId)
    const order = orders.find((item) => item.vaultHeld === 1) ?? orders[0]
    const ledger = this.runtime.escrowLedger
    try {
      const snapshot = await ledger.snapshot()
      const reserves = await ledger.accountReservesAt(snapshot)
      const [alice, bob, vault, escrow] = await Promise.all([
        ledger.accountFundsAt(resource.alice, snapshot, reserves),
        ledger.accountFundsAt(bobAddress, snapshot, reserves),
        ledger.accountFundsAt(resource.vault, snapshot, reserves),
        this.readEscrowFunds(order, resource, snapshot),
      ])
      const payout =
        order?.payoutLedgerIndex && order.payoutLedgerIndex <= snapshot.index && order.payoutDeliveredDrops &&
        (order.payoutBeneficiary === resource.alice || order.payoutBeneficiary === bobAddress)
          ? {
              beneficiary: order.payoutBeneficiary === bobAddress ? 'bob' as const : 'alice' as const,
              deliveredDrops: order.payoutDeliveredDrops,
            }
          : null
      return { resourceId: resource.resourceId, ledgerIndex: snapshot.index, accounts: { alice, bob, vault }, escrow, payout }
    } catch (error) {
      if (error instanceof LedgerUnavailable) {
        throw new HttpError(503, 'LEDGER_UNAVAILABLE', 'Balances temporarily unavailable.')
      }
      throw error
    }
  }

  private async readEscrowFunds(
    order: OrderRecord | undefined, resource: CatalogResourceConfig, snapshot: ValidatedLedger,
  ): Promise<ResourceFundsView['escrow']> {
    if (!order?.createHash) return { state: 'not_created', lockedDrops: '0' }
    const rentalResource = toRentalResource(resource)
    let rental: ReturnType<typeof verifyRental>
    try {
      rental = verifyRental(JSON.parse(order.bundleJson), rentalResource)
    } catch {
      return { state: 'mismatch', lockedDrops: null }
    }
    const paymentOrder = toPaymentOrder(rental, resource.scenario)
    try {
      const escrow = await this.runtime.escrowLedger.verifyEscrowAt(
        { ...paymentOrder, createHash: order.createHash },
        snapshot,
      )
      if (escrow.state === 'locked' || escrow.state === 'releasable') {
        return { state: escrow.state, lockedDrops: escrow.deposit.amountDrops }
      }
      if (escrow.state === 'credited_to_vault') {
        return { state: escrow.state, lockedDrops: '0', creditedDrops: escrow.deposit.amountDrops }
      }
      return { state: escrow.state, lockedDrops: null }
    } catch (error) {
      if (error instanceof LedgerUnavailable) return { state: 'unavailable', lockedDrops: null }
      throw error
    }
  }

  listListings() {
    return this.store.listListings()
  }

  publishListing(
    sessionRef: string | null,
    body: { readonly proposal: unknown; readonly proof: unknown },
  ): { readonly listing: ListingRecord; readonly revision: ListingRevisionRecord } {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect Alice’s wallet to publish a listing.')
    }
    let proposal: RentalProposal
    try {
      proposal = readProposal(body.proposal)
    } catch (error) {
      throw new HttpError(400, 'INVALID_PROPOSAL', error instanceof Error ? error.message : 'Invalid proposal.')
    }
    const resource = this.requireResource(proposal.resourceId)
    if (session.address !== resource.alice || proposal.alice !== resource.alice) {
      throw new HttpError(403, 'FORBIDDEN_LISTING', 'Only the owner wallet Alice can publish for this resource.')
    }
    if (
      proposal.titleNftId !== resource.titleNftId ||
      proposal.issuer !== resource.issuer ||
      proposal.feeBps !== resource.feeBps
    ) {
      throw new HttpError(400, 'RESOURCE_MISMATCH', 'Base title, issuer, or feeBps do not match catalog.')
    }
    if (proposal.startsAt < resource.validFrom || proposal.endsAt > resource.validTo) {
      throw new HttpError(400, 'OUTSIDE_TITLE_VALIDITY', 'The proposed interval exceeds the base title validity.')
    }
    try {
      if (verifyWalletSignature('rental-proposal', proposal, body.proof) !== proposal.alice) {
        throw new Error('Alice’s signature does not match the proposal address.')
      }
    } catch (error) {
      throw new HttpError(
        400,
        'INVALID_PROPOSAL_SIGNATURE',
        error instanceof Error ? error.message : 'Invalid Alice signature.',
      )
    }

    const split = splitRentalAmount(proposal.priceDrops, proposal.feeBps)
    const proposalHash = digestTerms(proposal)
    try {
      return this.store.saveListingRevision({
        listingId: proposal.listingId,
        resourceId: resource.resourceId,
        titleNftId: resource.titleNftId,
        issuer: resource.issuer,
        alice: resource.alice,
        revision: proposal.revision,
        startsAt: proposal.startsAt,
        endsAt: proposal.endsAt,
        priceDrops: split.grossDrops,
        feeBps: split.feeBps,
        feeDrops: split.feeDrops,
        netDrops: split.netDrops,
        proposalHash,
        proposalJson: JSON.stringify(proposal),
        proofJson: JSON.stringify(body.proof),
        nowUtc: this.nowUtc(),
      })
    } catch (error) {
      throw new HttpError(400, 'REVISION_CONFLICT', error instanceof Error ? error.message : 'Invalid revision.')
    }
  }

  async acceptListingOrder(
    sessionRef: string | null,
    listingId: string,
    acceptance: SignedOrder,
  ): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect Bob’s wallet to accept the proposal.')
    }
    const listing = this.store.getListing(listingId)
    if (!listing) {
      throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found.')
    }
    let parsedOrder: ReturnType<typeof readOrder>
    try {
      parsedOrder = readOrder(acceptance?.order)
    } catch (error) {
      throw new HttpError(400, 'INVALID_ORDER', error instanceof Error ? error.message : 'Invalid order.')
    }
    if (session.address !== parsedOrder.bob) {
      throw new HttpError(403, 'FORBIDDEN_ORDER', 'The authenticated session does not match Bob’s wallet in the order.')
    }

    const activeRev = this.store.getListingRevision(listing.listingId, listing.currentRevision)
    if (!activeRev) {
      throw new HttpError(404, 'REVISION_NOT_FOUND', 'Current revision missing.')
    }
    if (activeRev.status === 'rejected') {
      throw new HttpError(
        409,
        'REVISION_REJECTED',
        'This revision was rejected by the authority: Alice must publish a new revision.',
      )
    }
    if (parsedOrder.proposalHash !== activeRev.proposalHash) {
      throw new HttpError(
        409,
        'STALE_PROPOSAL_REVISION',
        'The acceptance does not match the active revision of the listing.',
      )
    }

    const resource = this.requireResource(activeRev.resourceId)
    const bundle: RentalBundle = {
      proposal: JSON.parse(activeRev.proposalJson) as RentalProposal,
      proof: JSON.parse(activeRev.proofJson),
      acceptance,
    }

    let verified: ReturnType<typeof verifyRental>
    try {
      verified = verifyRental(bundle, toRentalResource(resource))
    } catch (error) {
      throw new HttpError(400, 'INVALID_RENTAL_BUNDLE', error instanceof Error ? error.message : 'Invalid agreement.')
    }

    const paymentOrder = toPaymentOrder(verified, resource.scenario)
    try {
      const snapshot = await this.runtime.escrowLedger.snapshot()
      await this.runtime.escrowLedger.assertVaultReadyForOrder(paymentOrder, snapshot)
    } catch (error) {
      if (error instanceof Error && error.message.includes('LEDGER_UNAVAILABLE')) {
        throw new HttpError(503, 'LEDGER_UNAVAILABLE', 'XRPL node unavailable during vault verification.')
      }
      throw new HttpError(
        409,
        'VAULT_NOT_READY',
        error instanceof Error ? error.message : 'Vault not ready to receive an order.',
      )
    }

    let created: OrderRecord
    try {
      created = this.store.reserveOrderAtomically({
        orderId: verified.order.orderId,
        listingId: listing.listingId,
        revision: verified.proposal.revision,
        resourceId: resource.resourceId,
        scenario: resource.scenario,
        alice: verified.proposal.alice,
        bob: verified.order.bob,
        issuer: verified.proposal.issuer,
        vault: verified.order.vault,
        startsAt: verified.proposal.startsAt,
        endsAt: verified.proposal.endsAt,
        fundBy: verified.order.fundBy,
        priceDrops: verified.proposal.priceDrops,
        feeBps: verified.proposal.feeBps,
        feeDrops: verified.feeDrops,
        netDrops: verified.netDrops,
        proposalHash: verified.order.proposalHash,
        agreementHash: verified.agreementHash,
        bundleJson: JSON.stringify(bundle),
        nowUtc: this.nowUtc(),
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        throw new HttpError(409, error.code, error.message)
      }
      throw error
    }

    return this.buildOrderView(created)
  }

  async decideOrder(
    sessionRef: string | null,
    orderId: string,
    input: { readonly decision: 'approve' | 'reject'; readonly reason?: string },
  ): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect the competent authority wallet.')
    }
    const order = this.requireOrder(orderId)
    const resource = this.requireResource(order.resourceId)
    if (session.address !== resource.issuer) {
      throw new HttpError(
        403,
        'FORBIDDEN_AUTHORITY',
        `Only the competent authority (${resource.authorityName}) can evaluate this order.`,
      )
    }

    if (input.decision === 'reject') {
      if (order.status !== 'awaiting_authority') {
        throw new HttpError(409, 'INVALID_STATE', 'The order is no longer awaiting evaluation.')
      }
      const reason = input.reason?.trim()
      if (!reason) {
        throw new HttpError(400, 'REASON_REQUIRED', 'Enter a readable reason for rejection.')
      }
      const updated = this.store.updateOrder(orderId, {
        status: 'rejected',
        rejectionReason: reason,
        pendingStep: null,
        calendarHeld: 0,
        vaultHeld: 0,
        updatedAt: this.nowUtc(),
      })
      this.store.markListingRevisionRejected(order.listingId, order.revision)
      return this.buildOrderView(updated)
    }

    if (order.status !== 'awaiting_authority' && order.status !== 'approved_offer_pending') {
      if (order.status === 'approved_offer_ready') {
        return this.buildOrderView(order)
      }
      throw new HttpError(409, 'INVALID_STATE', `Cannot approve order in state ${order.status}.`)
    }

    const authoritySigner = this.getSignerByAddress(resource.issuer)
    if (!authoritySigner) {
      throw new HttpError(500, 'MISSING_AUTHORITY_SIGNER', 'Authority signer not configured.')
    }

    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    let result: Awaited<ReturnType<XrplRuntime['rentalNfts']['issuePass']>>
    try {
      result = await this.runtime.rentalNfts.issuePass(bundle, toRentalResource(resource), {
        signer: authoritySigner,
        confirm: async () => true,
      })
    } catch (error) {
      throw new HttpError(
        409,
        'ISSUE_PASS_FAILED',
        error instanceof Error ? error.message : 'Pass issuance failed.',
      )
    }

    if (result.status === 'pending') {
      const updated = this.store.updateOrder(orderId, {
        status: 'approved_offer_pending',
        pendingStep: result.stage === 'mint' ? 'issue_pass_mint' : 'issue_pass_offer',
        ...(result.stage === 'offer'
          ? {
              passNftId: result.nftId,
              mintTxHash: result.mintReceipt.txHash,
              mintLedgerHash: result.mintReceipt.ledgerHash,
              mintLedgerIndex: result.mintReceipt.ledgerIndex,
            }
          : {}),
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }

    if (result.status === 'rejected') {
      throw new HttpError(409, 'XRPL_REJECTED', `Pass transaction rejected by ledger: ${result.code}`)
    }

    const updated = this.store.updateOrder(orderId, {
      status: 'approved_offer_ready',
      pendingStep: null,
      passNftId: result.nftId,
      offerId: result.offerId,
      mintTxHash: result.mintReceipt.txHash,
      mintLedgerHash: result.mintReceipt.ledgerHash,
      mintLedgerIndex: result.mintReceipt.ledgerIndex,
      offerTxHash: result.offerReceipt.txHash,
      offerLedgerHash: result.offerReceipt.ledgerHash,
      offerLedgerIndex: result.offerReceipt.ledgerIndex,
      updatedAt: this.nowUtc(),
    })
    return this.buildOrderView(updated)
  }

  async acceptPassForOrder(sessionRef: string | null, orderId: string): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect Bob’s wallet to claim the pass.')
    }
    const order = this.requireOrder(orderId)
    if (session.address !== order.bob) {
      throw new HttpError(403, 'FORBIDDEN_ORDER', 'Only Bob can accept the named pass offer.')
    }
    if (order.status === 'awaiting_authority' || order.status === 'approved_offer_pending') {
      throw new HttpError(409, 'WAIT_AUTHORITY', 'The named pass offer is not yet validated.')
    }
    if (
      order.status !== 'approved_offer_ready' &&
      !(order.status === 'pass_delivered_unfunded' && order.acceptOfferHash)
    ) {
      throw new HttpError(409, 'INVALID_STATE', `Order state incompatible with pass delivery: ${order.status}.`)
    }
    if (order.acceptOfferHash && order.status === 'pass_delivered_unfunded') {
      return this.buildOrderView(order)
    }
    if (!order.passNftId || !order.offerId) {
      throw new HttpError(409, 'OFFER_NOT_READY', 'Missing pass and offer identifiers.')
    }

    const bobSigner = this.getSignerByAddress(order.bob)
    if (!bobSigner) {
      throw new HttpError(500, 'MISSING_BOB_SIGNER', 'Bob signer not configured.')
    }
    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle

    let accepted: Awaited<ReturnType<XrplRuntime['rentalNfts']['acceptPass']>>
    try {
      accepted = await this.runtime.rentalNfts.acceptPass(
        bundle,
        toRentalResource(resource),
        { nftId: order.passNftId, offerId: order.offerId },
        { signer: bobSigner, confirm: async () => true },
      )
    } catch (error) {
      throw new HttpError(
        409,
        'ACCEPT_PASS_FAILED',
        error instanceof Error ? error.message : 'Accepting pass offer failed.',
      )
    }

    if (accepted.status === 'pending') {
      const updated = this.store.updateOrder(orderId, {
        pendingStep: 'accept_pass',
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }
    if (accepted.status === 'rejected') {
      throw new HttpError(409, 'XRPL_REJECTED', `Pass acceptance rejected by ledger: ${accepted.code}`)
    }

    const updated = this.store.updateOrder(orderId, {
      status: 'pass_delivered_unfunded',
      pendingStep: null,
      acceptOfferHash: accepted.txHash,
      acceptLedgerHash: accepted.ledgerHash,
      acceptLedgerIndex: accepted.ledgerIndex,
      updatedAt: this.nowUtc(),
    })
    return this.buildOrderView(updated)
  }

  async depositEscrowForOrder(sessionRef: string | null, orderId: string): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect Bob’s wallet to sign the escrow deposit.')
    }
    const order = this.requireOrder(orderId)
    if (session.address !== order.bob) {
      throw new HttpError(403, 'FORBIDDEN_ORDER', 'Only Bob can sign the escrow deposit for this order.')
    }
    if (
      order.status !== 'pass_delivered_unfunded' &&
      order.status !== 'deposit_verifying' &&
      order.status !== 'confirmed'
    ) {
      throw new HttpError(
        409,
        'PASS_NOT_DELIVERED',
        'Deliver the pass NFT first (collecting the fee) before creating the deposit.',
      )
    }
    if (order.status === 'confirmed') {
      return this.buildOrderView(order)
    }

    const bobSigner = this.getSignerByAddress(order.bob)
    if (!bobSigner) {
      throw new HttpError(500, 'MISSING_BOB_SIGNER', 'Bob signer not configured.')
    }
    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rental = verifyRental(bundle, toRentalResource(resource))
    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      ...(order.passNftId ? { passNftId: order.passNftId } : {}),
      ...(order.offerId ? { offerId: order.offerId } : {}),
      ...(order.acceptOfferHash ? { acceptOfferHash: order.acceptOfferHash } : {}),
      ...(order.createHash ? { createHash: order.createHash } : {}),
    })

    let dep: Awaited<ReturnType<XrplRuntime['escrowService']['deposit']>>
    try {
      dep = await this.runtime.escrowService.deposit(paymentOrder, adaptLocalSigner(bobSigner))
    } catch (error) {
      throw new HttpError(
        409,
        'DEPOSIT_FAILED',
        error instanceof Error ? error.message : 'Escrow deposit creation failed.',
      )
    }

    if (dep.state === 'pending') {
      const updated = this.store.updateOrder(orderId, {
        status: 'deposit_verifying',
        pendingStep: 'escrow_create',
        createHash: dep.hash,
        escrowObjectId: dep.escrowObjectId,
        escrowSequence: dep.sequence,
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }

    if (dep.state !== 'validated' || !dep.deposit) {
      throw new HttpError(
        409,
        'DEPOSIT_REJECTED',
        `Escrow deposit not validated (${dep.state}: ${dep.result ?? 'unknown'}).`,
      )
    }

    // Composite pass + deposit verification on the same validated snapshot.
    const snapshot = await this.runtime.escrowLedger.snapshot()
    const passCheck = order.passNftId
      ? await verifyRentalPass(
          this.runtime.nftRpc,
          bundle,
          toRentalResource(resource),
          order.passNftId,
          snapshot.hash,
        )
      : 'absent'
    const escrowCheck = await this.runtime.escrowLedger.verifyEscrowAt(
      { ...paymentOrder, createHash: dep.hash },
      snapshot,
    )
    if (
      passCheck !== 'present' ||
      (escrowCheck.state !== 'locked' &&
        escrowCheck.state !== 'releasable' &&
        escrowCheck.state !== 'credited_to_vault')
    ) {
      throw new HttpError(
        409,
        'COMPOSITE_VERIFICATION_FAILED',
        `Composite snapshot verification failed (pass=${passCheck}, escrow=${escrowCheck.state}).`,
      )
    }

    const updated = this.store.updateOrder(orderId, {
      status: 'confirmed',
      pendingStep: null,
      createHash: dep.hash,
      escrowObjectId: dep.deposit.escrowObjectId,
      escrowSequence: dep.deposit.sequence,
      depositLedgerHash: dep.deposit.ledgerHash,
      depositLedgerIndex: dep.deposit.ledgerIndex,
      updatedAt: this.nowUtc(),
    })
    return this.buildOrderView(updated)
  }

  async releaseEscrowForOrder(sessionRef: string | null, orderId: string): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect a participant wallet to initiate release.')
    }
    const order = this.requireOrder(orderId)
    if (
      session.address !== order.alice &&
      session.address !== order.bob &&
      session.address !== order.issuer &&
      session.address !== this.runtime.setup.participants.operator
    ) {
      throw new HttpError(403, 'FORBIDDEN_ORDER', 'Only order participants can request escrow release.')
    }
    if (!order.createHash) {
      throw new HttpError(409, 'NO_ESCROW', 'No escrow deposit associated with this order.')
    }
    if (order.releaseTxHash) {
      return this.buildOrderView(order)
    }

    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rental = verifyRental(bundle, toRentalResource(resource))
    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      passNftId: order.passNftId ?? undefined,
      offerId: order.offerId ?? undefined,
      acceptOfferHash: order.acceptOfferHash ?? undefined,
      createHash: order.createHash,
    })

    let rel: Awaited<ReturnType<XrplRuntime['escrowService']['releaseToVault']>>
    try {
      rel = await this.runtime.escrowService.releaseToVault(
        paymentOrder,
        order.createHash,
        adaptLocalSigner(this.runtime.signers.operator),
      )
    } catch (error) {
      throw new HttpError(
        409,
        'ESCROW_NOT_RELEASABLE',
        error instanceof Error ? error.message : 'Escrow release not permitted.',
      )
    }

    if (rel.state === 'pending') {
      const updated = this.store.updateOrder(orderId, {
        pendingStep: 'escrow_finish',
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }
    if (rel.state !== 'validated' || !rel.release) {
      throw new HttpError(409, 'ESCROW_FINISH_FAILED', `Escrow release failed: ${rel.result ?? rel.state}.`)
    }

    const updated = this.store.updateOrder(orderId, {
      pendingStep: null,
      releaseTxHash: rel.release.txHash,
      releaseLedgerHash: rel.release.ledgerHash,
      releaseLedgerIndex: rel.release.ledgerIndex,
      updatedAt: this.nowUtc(),
    })
    return this.buildOrderView(updated)
  }

  async settleVaultForOrder(
    sessionRef: string | null,
    orderId: string,
    input: {
      readonly action?: 'prepare' | 'sign' | 'settle'
      readonly mode?: VaultResolutionMode
      readonly partialTxBlob?: string
      readonly signers?: readonly [LocalDemoRole, LocalDemoRole]
    },
  ): Promise<{ readonly order: OrderView; readonly progress: VaultPayoutProgress }> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect a signer wallet for vault settlement.')
    }
    const order = this.requireOrder(orderId)
    if (
      session.address !== order.alice &&
      session.address !== order.bob &&
      session.address !== order.issuer
    ) {
      throw new HttpError(403, 'FORBIDDEN_SETTLEMENT', 'Wallet is not a vault signer.')
    }
    if (!order.createHash) {
      throw new HttpError(409, 'NO_ESCROW', 'No escrow present for this order.')
    }

    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rental = verifyRental(bundle, toRentalResource(resource))
    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      passNftId: order.passNftId ?? undefined,
      offerId: order.offerId ?? undefined,
      acceptOfferHash: order.acceptOfferHash ?? undefined,
      createHash: order.createHash,
    })

    const mode: VaultResolutionMode = input.mode ?? 'ordinary'
    const action = input.action ?? (input.partialTxBlob ? 'sign' : input.signers ? 'settle' : 'prepare')

    let progress: VaultPayoutProgress
    try {
      if (action === 'prepare') {
        progress = await this.runtime.escrowService.prepareVaultPayout(
          paymentOrder,
          order.createHash,
          mode,
        )
      } else if (action === 'sign') {
        if (!input.partialTxBlob) {
          throw new HttpError(400, 'PARTIAL_BLOB_REQUIRED', 'Missing partialTxBlob.')
        }
        progress = await this.runtime.escrowService.addVaultSignature(
          paymentOrder,
          input.partialTxBlob,
        )
      } else {
        const pair = input.signers ?? (
          mode === 'ordinary'
            ? ['alice', 'bob']
            : mode === 'arbitration_alice'
              ? [resource.scenario === 'cad' ? 'cad' : 'comune', 'alice']
              : [resource.scenario === 'cad' ? 'cad' : 'comune', 'bob']
        )
        const s1 = this.getSignerForRole(pair[0])
        const s2 = this.getSignerForRole(pair[1])
        progress = await this.runtime.escrowService.settleVault(
          paymentOrder,
          order.createHash,
          mode,
          adaptLocalSigner(s1),
          adaptLocalSigner(s2),
        )
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(
        409,
        'VAULT_SETTLEMENT_ERROR',
        error instanceof Error ? error.message : 'Vault settlement failed.',
      )
    }

    let updated = order
    if (progress.phase === 'awaiting_signatures') {
      updated = this.store.updateOrder(orderId, {
        payoutResolutionMode: progress.resolutionMode,
        pendingStep: 'vault_payout_signatures',
        updatedAt: this.nowUtc(),
      })
    } else if (progress.phase === 'awaiting_ledger') {
      updated = this.store.updateOrder(orderId, {
        payoutTxHash: progress.attempt.hash,
        payoutResolutionMode: mode,
        pendingStep: 'vault_payout_ledger',
        updatedAt: this.nowUtc(),
      })
    } else if (progress.phase === 'validated') {
      const reconciled = await this.runtime.escrowService.reconcileOrder(orderId, true)
      updated = this.store.updateOrder(orderId, {
        status: reconciled.canReleaseVault ? 'settled' : order.status,
        calendarHeld: 0,
        vaultHeld: reconciled.canReleaseVault ? 0 : 1,
        pendingStep: reconciled.canReleaseVault ? null : 'vault_payout_reconcile',
        payoutTxHash: progress.payment.txHash,
        payoutLedgerHash: progress.payment.ledgerHash,
        payoutLedgerIndex: progress.payment.ledgerIndex,
        payoutBeneficiary: progress.payment.beneficiary,
        payoutDeliveredDrops: progress.payment.deliveredDrops,
        payoutResolutionMode: mode,
        updatedAt: this.nowUtc(),
      })
    } else {
      updated = this.store.updateOrder(orderId, {
        pendingStep: null,
        updatedAt: this.nowUtc(),
      })
    }

    return { order: await this.buildOrderView(updated), progress }
  }

  async recoverInterruptedOrder(sessionRef: string | null, orderId: string): Promise<OrderView> {
    const session = this.getSessionView(sessionRef)
    if (!session.authenticated || !session.address) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Connect an authorized wallet to initiate recovery.')
    }
    let order = this.requireOrder(orderId)
    const resource = this.requireResource(order.resourceId)
    if (
      session.address !== resource.issuer &&
      session.address !== order.alice &&
      session.address !== order.bob
    ) {
      throw new HttpError(403, 'FORBIDDEN_RECOVERY', 'Wallet not authorized to recover this order.')
    }

    // 1. Reconcile any pending submissions (NFT and Escrow).
    order = await this.reconcilePendingOrderSteps(order)

    if (order.status === 'revoked_refunded' || order.status === 'revoked_unpaid' || order.status === 'rejected') {
      return this.buildOrderView(order)
    }

    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rentalResource = toRentalResource(resource)
    const rental = verifyRental(bundle, rentalResource)
    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      passNftId: order.passNftId ?? undefined,
      offerId: order.offerId ?? undefined,
      acceptOfferHash: order.acceptOfferHash ?? undefined,
      createHash: order.createHash ?? undefined,
    })

    const escrowRec = await this.runtime.escrowService.reconcileOrder(orderId, true)
    const snapshot = await this.runtime.escrowLedger.snapshot()
    if (snapshot.closeTime <= rippleTime(order.fundBy)) {
      throw new HttpError(
        409,
        'CHECKOUT_STILL_OPEN',
        'The deposit window is still open: wait until expiration before revoking.',
      )
    }

    const depState = await rentalDepositState(
      this.runtime.escrowLedger,
      paymentOrder,
      snapshot,
      escrowRec.hasPendingOperations,
    )

    if (depState === 'pending') {
      const updated = this.store.updateOrder(orderId, {
        status: 'recovery_verifying',
        pendingStep: 'escrow_reconcile',
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }

    if (depState === 'present') {
      const updated = this.store.updateOrder(orderId, {
        status: 'confirmed',
        pendingStep: null,
        updatedAt: this.nowUtc(),
      })
      return this.buildOrderView(updated)
    }

    const authoritySigner = this.getSignerByAddress(resource.issuer)
    if (!authoritySigner) {
      throw new HttpError(500, 'MISSING_AUTHORITY_SIGNER', 'Authority signer not configured.')
    }

    // 2. Burn pass (only if not already validated and recorded).
    let feeRefundDue = order.feeRefundDue === null ? null : order.feeRefundDue === 1
    if (order.passNftId && !order.burnTxHash) {
      let burnResult: Awaited<ReturnType<XrplRuntime['rentalNfts']['revokePass']>>
      try {
        burnResult = await this.runtime.rentalNfts.revokePass(
          bundle,
          rentalResource,
          order.passNftId,
          { signer: authoritySigner, confirm: async () => true },
          async (_rental, snap) =>
            rentalDepositState(
              this.runtime.escrowLedger,
              paymentOrder,
              snap,
              escrowRec.hasPendingOperations,
            ),
        )
      } catch (error) {
        throw new HttpError(
          409,
          'REVOKE_PASS_FAILED',
          error instanceof Error ? error.message : 'Pass revocation failed.',
        )
      }

      if (burnResult.status === 'pending') {
        const updated = this.store.updateOrder(orderId, {
          status: 'recovery_verifying',
          pendingStep: 'revoke_pass',
          updatedAt: this.nowUtc(),
        })
        return this.buildOrderView(updated)
      }
      if (burnResult.status !== 'validated') {
        throw new HttpError(409, 'BURN_REJECTED', `Pass burn rejected: ${burnResult.code}`)
      }
      feeRefundDue = burnResult.feeRefundDue === true
      order = this.store.updateOrder(orderId, {
        burnTxHash: burnResult.receipt.txHash,
        burnLedgerHash: burnResult.receipt.ledgerHash,
        burnLedgerIndex: burnResult.receipt.ledgerIndex,
        feeRefundDue: feeRefundDue ? 1 : 0,
        calendarHeld: 0,
        status: feeRefundDue ? 'recovery_verifying' : 'revoked_unpaid',
        pendingStep: feeRefundDue ? 'fee_refund' : null,
        updatedAt: this.nowUtc(),
      })
    }

    // 3. Single refund of the fee if Bob claimed the pass and paid the fee.
    if (feeRefundDue === true && !order.refundTxHash) {
      if (!order.acceptOfferHash) {
        throw new HttpError(
          409,
          'MISSING_ACCEPT_RECEIPT',
          'Pass acceptance receipt missing: cannot verify fee refund.',
        )
      }
      let refundRes: Awaited<ReturnType<XrplRuntime['escrowService']['refundFee']>>
      try {
        refundRes = await this.runtime.escrowService.refundFee(
          paymentOrder,
          order.acceptOfferHash,
          adaptLocalSigner(authoritySigner),
        )
      } catch (error) {
        throw new HttpError(
          409,
          'FEE_REFUND_FAILED',
          error instanceof Error ? error.message : 'Fee refund failed.',
        )
      }

      if (refundRes.state === 'pending') {
        const updated = this.store.updateOrder(orderId, {
          status: 'recovery_verifying',
          pendingStep: 'fee_refund',
          refundTxHash: refundRes.hash,
          updatedAt: this.nowUtc(),
        })
        return this.buildOrderView(updated)
      }
      if (refundRes.state !== 'validated') {
        throw new HttpError(
          409,
          'FEE_REFUND_REJECTED',
          `Fee refund not validated: ${refundRes.result ?? refundRes.state}.`,
        )
      }

      order = this.store.updateOrder(orderId, {
        refundTxHash: refundRes.payment?.txHash ?? refundRes.hash,
        refundLedgerHash: refundRes.payment?.ledgerHash ?? refundRes.ledgerHash,
        refundLedgerIndex: refundRes.payment?.ledgerIndex ?? refundRes.ledgerIndex,
        updatedAt: this.nowUtc(),
      })
    }

    // 4. Release the vault only after final reconciliation confirms no pending operations.
    const finalRec = await this.runtime.escrowService.reconcileOrder(orderId, true)
    const finalStatus: OrderLifecycleStatus =
      feeRefundDue === true ? 'revoked_refunded' : 'revoked_unpaid'
    if (!finalRec.hasPendingOperations && finalRec.canReleaseVault) {
      order = this.store.updateOrder(orderId, {
        status: finalStatus,
        calendarHeld: 0,
        vaultHeld: 0,
        pendingStep: null,
        updatedAt: this.nowUtc(),
      })
    }
    return this.buildOrderView(order)
  }

  private async reconcilePendingOrderSteps(order: OrderRecord): Promise<OrderRecord> {
    const resource = this.requireResource(order.resourceId)
    const bundle = JSON.parse(order.bundleJson) as RentalBundle
    const rentalResource = toRentalResource(resource)
    let current = order

    if (current.status === 'approved_offer_pending' || current.pendingStep?.startsWith('issue_pass')) {
      const authoritySigner = this.getSignerByAddress(resource.issuer)
      if (authoritySigner) {
        const res = await this.runtime.rentalNfts.issuePass(bundle, rentalResource, {
          signer: authoritySigner,
          confirm: async () => true,
        })
        if (res.status === 'validated') {
          current = this.store.updateOrder(current.orderId, {
            status: 'approved_offer_ready',
            pendingStep: null,
            passNftId: res.nftId,
            offerId: res.offerId,
            mintTxHash: res.mintReceipt.txHash,
            mintLedgerHash: res.mintReceipt.ledgerHash,
            mintLedgerIndex: res.mintReceipt.ledgerIndex,
            offerTxHash: res.offerReceipt.txHash,
            offerLedgerHash: res.offerReceipt.ledgerHash,
            offerLedgerIndex: res.offerReceipt.ledgerIndex,
            updatedAt: this.nowUtc(),
          })
        }
      }
    }

    if (current.pendingStep === 'accept_pass' && current.passNftId && current.offerId) {
      const bobSigner = this.getSignerByAddress(current.bob)
      if (bobSigner) {
        const res = await this.runtime.rentalNfts.acceptPass(
          bundle,
          rentalResource,
          { nftId: current.passNftId, offerId: current.offerId },
          { signer: bobSigner, confirm: async () => true },
        )
        if (res.status === 'validated') {
          current = this.store.updateOrder(current.orderId, {
            status: 'pass_delivered_unfunded',
            pendingStep: null,
            acceptOfferHash: res.txHash,
            acceptLedgerHash: res.ledgerHash,
            acceptLedgerIndex: res.ledgerIndex,
            updatedAt: this.nowUtc(),
          })
        }
      }
    }

    const escrowRec = await this.runtime.escrowService.reconcileOrder(current.orderId, true)
    for (const item of escrowRec.attempts) {
      if (item.action === 'escrow_create' && item.state === 'validated' && !current.depositLedgerHash) {
        const escrowObjectId = current.escrowObjectId
        current = this.store.updateOrder(current.orderId, {
          status: current.status === 'deposit_verifying' || current.status === 'pass_delivered_unfunded'
            ? 'confirmed'
            : current.status,
          pendingStep: current.pendingStep === 'escrow_create' ? null : current.pendingStep,
          createHash: item.hash,
          escrowSequence: item.sequence,
          escrowObjectId,
          depositLedgerHash: item.ledgerHash,
          depositLedgerIndex: item.ledgerIndex,
          updatedAt: this.nowUtc(),
        })
      }
      if (item.action === 'escrow_finish' && item.state === 'validated' && !current.releaseTxHash) {
        current = this.store.updateOrder(current.orderId, {
          pendingStep: current.pendingStep === 'escrow_finish' ? null : current.pendingStep,
          releaseTxHash: item.hash,
          releaseLedgerHash: item.ledgerHash,
          releaseLedgerIndex: item.ledgerIndex,
          updatedAt: this.nowUtc(),
        })
      }
      if (item.action === 'vault_payout' && item.state === 'validated' && !current.payoutLedgerHash) {
        current = this.store.updateOrder(current.orderId, {
          status: escrowRec.canReleaseVault ? 'settled' : current.status,
          calendarHeld: 0,
          vaultHeld: escrowRec.canReleaseVault ? 0 : 1,
          pendingStep: null,
          payoutTxHash: item.hash,
          payoutLedgerHash: item.ledgerHash,
          payoutLedgerIndex: item.ledgerIndex,
          payoutDeliveredDrops: item.deliveredDrops,
          updatedAt: this.nowUtc(),
        })
      }
      if (item.action === 'fee_refund' && item.state === 'validated' && !current.refundLedgerHash) {
        current = this.store.updateOrder(current.orderId, {
          refundTxHash: item.hash,
          refundLedgerHash: item.ledgerHash,
          refundLedgerIndex: item.ledgerIndex,
          updatedAt: this.nowUtc(),
        })
        if (!escrowRec.hasPendingOperations && escrowRec.canReleaseVault && current.burnTxHash) {
          current = this.store.updateOrder(current.orderId, {
            status: 'revoked_refunded',
            calendarHeld: 0,
            vaultHeld: 0,
            pendingStep: null,
            updatedAt: this.nowUtc(),
          })
        }
      }
    }

    return current
  }

  async reconcileOrder(orderId: string): Promise<OrderView> {
    const order = this.requireOrder(orderId)
    const updated = await this.reconcilePendingOrderSteps(order)
    return this.buildOrderView(updated)
  }

  async listOrderViews(resourceId?: string): Promise<OrderView[]> {
    const list = this.store.listOrders(resourceId)
    const views: OrderView[] = []
    for (const order of list) {
      views.push(await this.buildOrderView(order))
    }
    return views
  }

  async getOrderView(orderId: string): Promise<OrderView> {
    const order = this.requireOrder(orderId)
    return this.buildOrderView(order)
  }

  private effectiveLifecycleStatus(order: OrderRecord): OrderLifecycleStatus {
    if (order.status === 'confirmed') {
      const now = this.nowUtc()
      if (now >= order.endsAt) return 'expired'
      if (now >= order.startsAt) return 'active'
    }
    return order.status
  }

  private async buildOrderView(order: OrderRecord): Promise<OrderView> {
    const resource = this.requireResource(order.resourceId)
    const effectiveStatus = this.effectiveLifecycleStatus(order)

    let escrowState: SettlementUiView['escrowState'] = order.createHash ? 'pending' : 'not_created'
    let escrowLabel = order.createHash ? 'Verifying' : 'Deposit not yet submitted'
    let payoutPhase: SettlementUiView['payoutPhase'] = 'not_ready'
    let payoutLabel = 'Not ready'
    let beneficiary: string | null = order.payoutBeneficiary
    let collectedSigners: readonly string[] = []
    let allowedSigners: readonly string[] = []
    let preparedTransactionJson: string | null = null
    let resolutionMode: VaultResolutionMode | null = order.payoutResolutionMode

    if (order.payoutLedgerHash && order.payoutTxHash) {
      payoutPhase = 'validated'
      payoutLabel = 'Settlement validated'
    } else if (order.pendingStep === 'vault_payout_ledger') {
      payoutPhase = 'awaiting_ledger'
      payoutLabel = 'Awaiting ledger'
    } else {
      const draft = this.runtime.attemptStore.getMultisigDraft(order.orderId)
      if (draft && draft.submittedHash === null) {
        payoutPhase = 'awaiting_signatures'
        payoutLabel = 'Awaiting signature (2 of 3)'
        resolutionMode = draft.resolutionMode
        beneficiary = draft.beneficiary
        collectedSigners = [draft.sig1Signer, draft.sig2Signer].filter(
          (s): s is string => typeof s === 'string',
        )
        preparedTransactionJson = draft.preparedTxJson
      }
    }

    if (order.createHash) {
      try {
        const bundle = JSON.parse(order.bundleJson) as RentalBundle
        const rental = verifyRental(bundle, toRentalResource(resource))
        const paymentOrder = toPaymentOrder(rental, resource.scenario, {
          passNftId: order.passNftId ?? undefined,
          offerId: order.offerId ?? undefined,
          acceptOfferHash: order.acceptOfferHash ?? undefined,
          createHash: order.createHash,
        })
        if (payoutPhase === 'awaiting_signatures' && resolutionMode) {
          allowedSigners = resolveVaultSettlement(paymentOrder, resolutionMode).allowedSigners
        }
        const snap = await this.runtime.escrowLedger.snapshot()
        const esc = await this.runtime.escrowLedger.verifyEscrowAt(
          { ...paymentOrder, createHash: order.createHash },
          snap,
        )
        escrowState = esc.state
        if (esc.state === 'locked') escrowLabel = 'Deposit locked in escrow'
        else if (esc.state === 'releasable') escrowLabel = 'Releasable (EscrowFinish ready)'
        else if (esc.state === 'credited_to_vault') escrowLabel = 'Credited to vault'
        else if (esc.state === 'pending') escrowLabel = 'Awaiting ledger'
        else if (esc.state === 'missing') escrowLabel = 'Missing'
        else if (esc.state === 'mismatch') escrowLabel = 'Mismatch'
      } catch {
        escrowState = 'unavailable'
        escrowLabel = 'Ledger unavailable'
      }
    }

    if (order.pendingStep === 'escrow_finish') {
      escrowLabel = 'Release submitted (awaiting ledger)'
    }

    const statusDescriptions: Record<OrderLifecycleStatus, { label: string; nextSigner: string | null; nextAction: string }> = {
      awaiting_authority: {
        label: 'Awaiting authority',
        nextSigner: resource.authorityName,
        nextAction: `Manual review by ${resource.authorityName} (approve/reject)`,
      },
      rejected: {
        label: 'Rejected by authority',
        nextSigner: 'Alice',
        nextAction: 'Alice can propose a new price on a new revision',
      },
      approved_offer_pending: {
        label: 'Verifying (pass issuance)',
        nextSigner: null,
        nextAction: 'Reconcile mint/offer transaction on the ledger',
      },
      approved_offer_ready: {
        label: 'Pass issued · offer ready for Bob',
        nextSigner: 'Bob',
        nextAction: 'Bob accepts the pass offer and pays the authority fee',
      },
      pass_delivered_unfunded: {
        label: 'Pass delivered · deposit missing',
        nextSigner: 'Bob',
        nextAction: 'Bob deposits net amount into the timed escrow or authority starts recovery after deadline',
      },
      deposit_verifying: {
        label: 'Verifying (escrow deposit)',
        nextSigner: null,
        nextAction: 'Wait for EscrowCreate validation on the ledger',
      },
      confirmed: {
        label: 'Booking confirmed',
        nextSigner: null,
        nextAction: 'Wait for the agreed start time',
      },
      active: {
        label: 'Active rental',
        nextSigner: null,
        nextAction: 'Bob has exclusive use of the resource until expiration',
      },
      expired: {
        label: 'Rental ended',
        nextSigner: escrowState === 'credited_to_vault' ? '2 of 3 signers (Alice, Bob, or Authority)' : 'Operator / 2 signers',
        nextAction:
          escrowState === 'credited_to_vault'
            ? 'Collect 2 of 3 signatures to settle net payout from the vault'
            : 'Submit EscrowFinish and collect 2 of 3 signatures on the vault',
      },
      recovery_verifying: {
        label: 'Verifying (checkout recovery)',
        nextSigner: resource.authorityName,
        nextAction: 'Reconcile pass burn and fee refund on the ledger',
      },
      revoked_refunded: {
        label: 'Pass revoked and fee refunded',
        nextSigner: null,
        nextAction: 'Order closed and vault released',
      },
      revoked_unpaid: {
        label: 'Offer expired · pass revoked with no charges',
        nextSigner: null,
        nextAction: 'Order closed and vault released',
      },
      settled: {
        label: 'Settled and closed',
        nextSigner: null,
        nextAction: 'Net payout settled and vault available for new orders',
      },
    }

    const desc = statusDescriptions[effectiveStatus]

    return {
      orderId: order.orderId,
      listingId: order.listingId,
      revision: order.revision,
      resourceId: order.resourceId,
      resourceName: resource.displayName,
      scenario: order.scenario,
      alice: order.alice,
      bob: order.bob,
      issuer: order.issuer,
      authorityName: resource.authorityName,
      vault: order.vault,
      startsAt: order.startsAt,
      endsAt: order.endsAt,
      fundBy: order.fundBy,
      startsAtTorino: formatTorinoDateTime(order.startsAt),
      endsAtTorino: formatTorinoDateTime(order.endsAt),
      fundByTorino: formatTorinoDateTime(order.fundBy),
      priceDrops: order.priceDrops,
      feeBps: order.feeBps,
      feeDrops: order.feeDrops,
      netDrops: order.netDrops,
      proposalHash: order.proposalHash,
      agreementHash: order.agreementHash,
      status: effectiveStatus,
      statusLabel: order.pendingStep && !desc.label.includes('Verifying') ? `${desc.label} (Verifying)` : desc.label,
      rejectionReason: order.rejectionReason,
      pendingStep: order.pendingStep,
      nextSigner: desc.nextSigner,
      nextActionLabel: desc.nextAction,
      calendarHeld: order.calendarHeld === 1,
      vaultHeld: order.vaultHeld === 1,
      receipts: {
        passNftId: order.passNftId,
        offerId: order.offerId,
        mintTxHash: order.mintTxHash,
        mintLedgerHash: order.mintLedgerHash,
        mintLedgerIndex: order.mintLedgerIndex,
        offerTxHash: order.offerTxHash,
        offerLedgerHash: order.offerLedgerHash,
        offerLedgerIndex: order.offerLedgerIndex,
        acceptOfferHash: order.acceptOfferHash,
        acceptLedgerHash: order.acceptLedgerHash,
        acceptLedgerIndex: order.acceptLedgerIndex,
        createHash: order.createHash,
        escrowObjectId: order.escrowObjectId,
        escrowSequence: order.escrowSequence,
        depositLedgerHash: order.depositLedgerHash,
        depositLedgerIndex: order.depositLedgerIndex,
        releaseTxHash: order.releaseTxHash,
        releaseLedgerHash: order.releaseLedgerHash,
        releaseLedgerIndex: order.releaseLedgerIndex,
        payoutTxHash: order.payoutTxHash,
        payoutLedgerHash: order.payoutLedgerHash,
        payoutLedgerIndex: order.payoutLedgerIndex,
        payoutBeneficiary: order.payoutBeneficiary,
        payoutDeliveredDrops: order.payoutDeliveredDrops,
        payoutResolutionMode: order.payoutResolutionMode,
        burnTxHash: order.burnTxHash,
        burnLedgerHash: order.burnLedgerHash,
        burnLedgerIndex: order.burnLedgerIndex,
        feeRefundDue: order.feeRefundDue === null ? null : order.feeRefundDue === 1,
        refundTxHash: order.refundTxHash,
        refundLedgerHash: order.refundLedgerHash,
        refundLedgerIndex: order.refundLedgerIndex,
      },
      settlement: {
        escrowState,
        escrowLabel,
        payoutPhase,
        payoutLabel,
        resolutionMode,
        beneficiary,
        collectedSigners,
        allowedSigners,
        preparedTransactionJson,
      },
    }
  }

  // --- Shared access control (CAD and Billboard) ---

  private async verifyConfirmedOrderOnSnapshot(
    order: OrderRecord,
    resource: CatalogResourceConfig,
    snapshotHash: string,
    snapshotIndex: number,
    snapshotCloseTime: number,
  ): Promise<boolean> {
    if (!order.passNftId || !order.createHash) return false
    let bundle: RentalBundle
    let rental: ReturnType<typeof verifyRental>
    try {
      bundle = JSON.parse(order.bundleJson) as RentalBundle
      rental = verifyRental(bundle, toRentalResource(resource))
    } catch {
      return false
    }
    if (rental.agreementHash !== order.agreementHash) return false

    const passStatus = await verifyRentalPass(
      this.runtime.nftRpc,
      bundle,
      toRentalResource(resource),
      order.passNftId,
      snapshotHash,
    )
    if (passStatus === 'unavailable') {
      throw new Error('LEDGER_UNAVAILABLE')
    }
    if (passStatus !== 'present') return false

    const paymentOrder = toPaymentOrder(rental, resource.scenario, {
      passNftId: order.passNftId,
      offerId: order.offerId ?? undefined,
      acceptOfferHash: order.acceptOfferHash ?? undefined,
      createHash: order.createHash,
    })
    const escStatus = await this.runtime.escrowLedger.verifyEscrowAt(
      { ...paymentOrder, createHash: order.createHash },
      { hash: snapshotHash, index: snapshotIndex, closeTime: snapshotCloseTime },
    )
    return (
      escStatus.state === 'locked' ||
      escStatus.state === 'releasable' ||
      escStatus.state === 'credited_to_vault'
    )
  }

  async evaluateResourceAccess(
    sessionRef: string | null,
    rawResourceId: string,
  ): Promise<AccessDecisionView> {
    const resource = this.requireResource(rawResourceId)
    const session = this.getSessionView(sessionRef)
    const nowUtc = this.nowUtc()
    const nowTorino = formatTorinoDateTime(nowUtc)
    const isCad = resource.serviceType === 'cad_portal'
    const resourceShortLabel = isCad ? 'this CAD seat' : `installation ${resource.resourceId}`

    const baseInfo = {
      resourceId: resource.resourceId,
      serviceType: resource.serviceType,
      resourceName: resource.displayName,
      authorityName: resource.authorityName,
      sessionAddress: session.address,
      role: session.role,
      serverNowUtc: nowUtc,
      serverNowTorino: nowTorino,
    } as const

    // Composite verification on a shared validated snapshot (retried once if the node advances during reading).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const snapshot = await this.runtime.escrowLedger.snapshot()
        const titleCheck = await verifyRentalTitle(
          this.runtime.nftRpc,
          toRentalResource(resource),
          snapshot.hash,
        )
        if (titleCheck === 'unavailable') {
          throw new Error('LEDGER_UNAVAILABLE')
        }

        let titleState: AccessDecisionView['titleState']
        if (nowUtc < resource.validFrom) titleState = 'not_yet_valid'
        else if (nowUtc >= resource.validTo) titleState = 'expired'
        else if (titleCheck === 'present') titleState = 'active'
        else titleState = 'absent'

        if (!session.authenticated || !session.address) {
          return {
            ...baseInfo,
            canAccess: false,
            httpStatus: 401,
            code: 'SESSION_REQUIRED',
            titleState,
            headline: 'Session required',
            reason: 'Connect your wallet with a one-time signature to verify access rights.',
            activeOrderId: null,
            activeFromUtc: null,
            activeUntilUtc: null,
            activeFromTorino: null,
            activeUntilTorino: null,
            nextTransitionAtUtc: null,
            nextTransitionAtTorino: null,
            ledgerSnapshotHash: snapshot.hash,
            ledgerSnapshotIndex: snapshot.index,
          }
        }

        const orders = this.store.listOrdersForResource(resource.resourceId)
        const windowOrders = orders.filter(
          (o) =>
            o.startsAt <= nowUtc &&
            nowUtc < o.endsAt &&
            (o.status === 'confirmed' || o.status === 'active'),
        )

        let verifiedActiveOrder: OrderRecord | null = null
        if (titleState === 'active') {
          for (const candidate of windowOrders) {
            const ok = await this.verifyConfirmedOrderOnSnapshot(
              candidate,
              resource,
              snapshot.hash,
              snapshot.index,
              snapshot.closeTime,
            )
            if (ok) {
              verifiedActiveOrder = candidate
              break
            }
          }
        }

        if (verifiedActiveOrder) {
          const untilTorino = formatTorinoDateTime(verifiedActiveOrder.endsAt)
          if (session.address === verifiedActiveOrder.bob) {
            return {
              ...baseInfo,
              canAccess: true,
              httpStatus: 200,
              code: 'BOB_ACTIVE',
              titleState,
              headline: `Pass active until ${untilTorino}.`,
              reason: `Pass active until ${untilTorino}.`,
              activeOrderId: verifiedActiveOrder.orderId,
              activeFromUtc: verifiedActiveOrder.startsAt,
              activeUntilUtc: verifiedActiveOrder.endsAt,
              activeFromTorino: formatTorinoDateTime(verifiedActiveOrder.startsAt),
              activeUntilTorino: untilTorino,
              nextTransitionAtUtc: verifiedActiveOrder.endsAt,
              nextTransitionAtTorino: untilTorino,
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
          if (session.address === resource.alice) {
            return {
              ...baseInfo,
              canAccess: false,
              httpStatus: 403,
              code: 'ALICE_SUSPENDED',
              titleState,
              headline: `You have rented your license to Bob until ${untilTorino}. Features are suspended until then.`,
              reason: `You have rented your license to Bob until ${untilTorino}. Features are suspended until then.`,
              activeOrderId: verifiedActiveOrder.orderId,
              activeFromUtc: verifiedActiveOrder.startsAt,
              activeUntilUtc: verifiedActiveOrder.endsAt,
              activeFromTorino: formatTorinoDateTime(verifiedActiveOrder.startsAt),
              activeUntilTorino: untilTorino,
              nextTransitionAtUtc: verifiedActiveOrder.endsAt,
              nextTransitionAtTorino: untilTorino,
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
          return {
            ...baseInfo,
            canAccess: false,
            httpStatus: 403,
            code: 'NO_RIGHT',
            titleState,
            headline: 'Access unavailable',
            reason: `Access unavailable. This wallet does not hold a valid right for ${resourceShortLabel}.`,
            activeOrderId: verifiedActiveOrder.orderId,
            activeFromUtc: verifiedActiveOrder.startsAt,
            activeUntilUtc: verifiedActiveOrder.endsAt,
            activeFromTorino: formatTorinoDateTime(verifiedActiveOrder.startsAt),
            activeUntilTorino: untilTorino,
            nextTransitionAtUtc: verifiedActiveOrder.endsAt,
            nextTransitionAtTorino: untilTorino,
            ledgerSnapshotHash: snapshot.hash,
            ledgerSnapshotIndex: snapshot.index,
          }
        }

        // No active verified rental right now. Check upcoming bookings or Bob / Alice states.
        const upcomingConfirmed = orders.find(
          (o) => (o.status === 'confirmed' || o.status === 'active') && nowUtc < o.startsAt,
        )
        let verifiedUpcoming: OrderRecord | null = null
        if (upcomingConfirmed && titleState === 'active') {
          const ok = await this.verifyConfirmedOrderOnSnapshot(
            upcomingConfirmed,
            resource,
            snapshot.hash,
            snapshot.index,
            snapshot.closeTime,
          )
          if (ok) verifiedUpcoming = upcomingConfirmed
        }

        if (session.address === resource.alice) {
          const nextChange = verifiedUpcoming?.startsAt ?? resource.validTo
          if (titleState === 'active') {
            const untilText = verifiedUpcoming
              ? `Active license. Next confirmed booking starting ${formatTorinoDateTime(verifiedUpcoming.startsAt)}.`
              : `Active license until ${formatTorinoDateTime(resource.validTo)}.`
            return {
              ...baseInfo,
              canAccess: true,
              httpStatus: 200,
              code: 'ALICE_ACTIVE',
              titleState,
              headline: 'Active license',
              reason: untilText,
              activeOrderId: null,
              activeFromUtc: resource.validFrom,
              activeUntilUtc: nextChange,
              activeFromTorino: formatTorinoDateTime(resource.validFrom),
              activeUntilTorino: formatTorinoDateTime(nextChange),
              nextTransitionAtUtc: nextChange,
              nextTransitionAtTorino: formatTorinoDateTime(nextChange),
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
          if (titleState === 'expired') {
            return {
              ...baseInfo,
              canAccess: false,
              httpStatus: 403,
              code: 'LICENSE_EXPIRED',
              titleState,
              headline: 'License expired',
              reason: 'License expired. The main title has ended.',
              activeOrderId: null,
              activeFromUtc: null,
              activeUntilUtc: null,
              activeFromTorino: null,
              activeUntilTorino: null,
              nextTransitionAtUtc: null,
              nextTransitionAtTorino: null,
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
          return {
            ...baseInfo,
            canAccess: false,
            httpStatus: 403,
            code: 'NO_RIGHT',
            titleState,
            headline: 'Invalid base title',
            reason: `Base title not verified on the ledger for ${resourceShortLabel}.`,
            activeOrderId: null,
            activeFromUtc: null,
            activeUntilUtc: null,
            activeFromTorino: null,
            activeUntilTorino: null,
            nextTransitionAtUtc: null,
            nextTransitionAtTorino: null,
            ledgerSnapshotHash: snapshot.hash,
            ledgerSnapshotIndex: snapshot.index,
          }
        }

        // Check status of the most relevant order for Bob (excluding orders tampered with only in SQLite).
        const bobOrdersDesc = this.store
          .listOrders(resource.resourceId)
          .filter((o) => o.bob === session.address)
        const latestBob = bobOrdersDesc[0]

        if (verifiedUpcoming && verifiedUpcoming.bob === session.address) {
          const startTorino = formatTorinoDateTime(verifiedUpcoming.startsAt)
          return {
            ...baseInfo,
            canAccess: false,
            httpStatus: 409,
            code: 'CONFIRMED_BEFORE_START',
            titleState,
            headline: `Booking confirmed. You will be able to use the ${isCad ? 'CAD' : 'billboard'} starting ${startTorino}.`,
            reason: `Booking confirmed. You will be able to use the ${isCad ? 'CAD' : 'billboard'} starting ${startTorino}.`,
            activeOrderId: verifiedUpcoming.orderId,
            activeFromUtc: verifiedUpcoming.startsAt,
            activeUntilUtc: verifiedUpcoming.endsAt,
            activeFromTorino: startTorino,
            activeUntilTorino: formatTorinoDateTime(verifiedUpcoming.endsAt),
            nextTransitionAtUtc: verifiedUpcoming.startsAt,
            nextTransitionAtTorino: startTorino,
            ledgerSnapshotHash: snapshot.hash,
            ledgerSnapshotIndex: snapshot.index,
          }
        }

        if (
          latestBob &&
          (latestBob.status === 'pass_delivered_unfunded' || latestBob.status === 'deposit_verifying') &&
          latestBob.passNftId
        ) {
          const bundle = JSON.parse(latestBob.bundleJson) as RentalBundle
          const passPresent =
            (await verifyRentalPass(
              this.runtime.nftRpc,
              bundle,
              toRentalResource(resource),
              latestBob.passNftId,
              snapshot.hash,
            )) === 'present'
          if (passPresent) {
            return {
              ...baseInfo,
              canAccess: false,
              httpStatus: 409,
              code: 'PASS_DELIVERED_NO_DEPOSIT',
              titleState,
              headline: 'Pass received. Complete the deposit to confirm the rental.',
              reason: 'Pass received. Complete the deposit to confirm the rental.',
              activeOrderId: latestBob.orderId,
              activeFromUtc: latestBob.startsAt,
              activeUntilUtc: latestBob.endsAt,
              activeFromTorino: formatTorinoDateTime(latestBob.startsAt),
              activeUntilTorino: formatTorinoDateTime(latestBob.endsAt),
              nextTransitionAtUtc: null,
              nextTransitionAtTorino: null,
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
        }

        if (
          latestBob &&
          (latestBob.status === 'awaiting_authority' ||
            latestBob.status === 'approved_offer_pending' ||
            latestBob.status === 'approved_offer_ready')
        ) {
          const msg =
            latestBob.status === 'approved_offer_ready'
              ? 'Pass approved by authority. Accept the offer and complete the deposit.'
              : 'Awaiting authority.'
          return {
            ...baseInfo,
            canAccess: false,
            httpStatus: 403,
            code: 'WAIT_AUTHORITY',
            titleState,
            headline: msg,
            reason: msg,
            activeOrderId: latestBob.orderId,
            activeFromUtc: latestBob.startsAt,
            activeUntilUtc: latestBob.endsAt,
            activeFromTorino: formatTorinoDateTime(latestBob.startsAt),
            activeUntilTorino: formatTorinoDateTime(latestBob.endsAt),
            nextTransitionAtUtc: null,
            nextTransitionAtTorino: null,
            ledgerSnapshotHash: snapshot.hash,
            ledgerSnapshotIndex: snapshot.index,
          }
        }

        if (
          latestBob &&
          nowUtc >= latestBob.endsAt &&
          (latestBob.status === 'confirmed' ||
            latestBob.status === 'active' ||
            latestBob.status === 'expired' ||
            latestBob.status === 'settled') &&
          latestBob.passNftId &&
          latestBob.createHash
        ) {
          const verifiedExpired = await this.verifyConfirmedOrderOnSnapshot(
            latestBob,
            resource,
            snapshot.hash,
            snapshot.index,
            snapshot.closeTime,
          )
          if (verifiedExpired) {
            return {
              ...baseInfo,
              canAccess: false,
              httpStatus: 403,
              code: 'RENTAL_EXPIRED',
              titleState,
              headline: 'Pass expired. The usage period has ended.',
              reason: 'Pass expired. The usage period has ended.',
              activeOrderId: latestBob.orderId,
              activeFromUtc: latestBob.startsAt,
              activeUntilUtc: latestBob.endsAt,
              activeFromTorino: formatTorinoDateTime(latestBob.startsAt),
              activeUntilTorino: formatTorinoDateTime(latestBob.endsAt),
              nextTransitionAtUtc: null,
              nextTransitionAtTorino: null,
              ledgerSnapshotHash: snapshot.hash,
              ledgerSnapshotIndex: snapshot.index,
            }
          }
        }

        return {
          ...baseInfo,
          canAccess: false,
          httpStatus: 403,
          code: 'NO_RIGHT',
          titleState,
          headline: 'Access unavailable',
          reason: `Access unavailable. This wallet does not hold a valid right for ${resourceShortLabel}.`,
          activeOrderId: null,
          activeFromUtc: null,
          activeUntilUtc: null,
          activeFromTorino: null,
          activeUntilTorino: null,
          nextTransitionAtUtc: verifiedUpcoming?.startsAt ?? null,
          nextTransitionAtTorino: verifiedUpcoming
            ? formatTorinoDateTime(verifiedUpcoming.startsAt)
            : null,
          ledgerSnapshotHash: snapshot.hash,
          ledgerSnapshotIndex: snapshot.index,
        }
      } catch {
        if (attempt === 0) continue
        return {
          ...baseInfo,
          canAccess: false,
          httpStatus: 503,
          code: 'LEDGER_UNAVAILABLE',
          titleState: 'unavailable',
          headline: 'Ledger verification unavailable',
          reason: 'XRPL Testnet node temporarily unreachable. Please try again shortly.',
          activeOrderId: null,
          activeFromUtc: null,
          activeUntilUtc: null,
          activeFromTorino: null,
          activeUntilTorino: null,
          nextTransitionAtUtc: null,
          nextTransitionAtTorino: null,
          ledgerSnapshotHash: null,
          ledgerSnapshotIndex: null,
        }
      }
    }

    throw new HttpError(503, 'LEDGER_UNAVAILABLE', 'Ledger verification unavailable.')
  }

  async openCadDemoProject(sessionRef: string | null, rawResourceId: string) {
    const access = await this.evaluateResourceAccess(sessionRef, rawResourceId)
    if (access.serviceType !== 'cad_portal') {
      throw new HttpError(400, 'NOT_CAD_RESOURCE', 'The selected resource is not a CAD seat.')
    }
    if (!access.canAccess) {
      throw new HttpError(access.httpStatus, access.code, access.reason)
    }
    return {
      access,
      project: {
        projectId: 'cad-assieme-riduttore-2026',
        title: 'Epicyclic Gearbox Assembly · Rev. 4',
        seatName: access.resourceName,
        openedByRole: access.role,
        openedByAddress: access.sessionAddress,
        validUntilUtc: access.activeUntilUtc,
        validUntilTorino: access.activeUntilTorino,
        nextTransitionAtUtc: access.nextTransitionAtUtc,
        partsCount: 14,
      },
    }
  }

  // --- Advertising billboard ---

  async uploadBillboardImage(
    sessionRef: string | null,
    rawResourceId: string,
    bytes: Uint8Array,
  ): Promise<BillboardPublicationRecord> {
    const access = await this.evaluateResourceAccess(sessionRef, rawResourceId)
    if (access.serviceType !== 'digital_billboard') {
      throw new HttpError(400, 'NOT_BILLBOARD_RESOURCE', 'The selected resource is not an advertising billboard.')
    }
    if (!access.canAccess) {
      throw new HttpError(access.httpStatus, access.code, access.reason)
    }

    let decoded: ReturnType<typeof validateAndDecodeImage>
    try {
      decoded = validateAndDecodeImage(bytes)
    } catch (error) {
      throw new HttpError(
        400,
        'INVALID_IMAGE',
        error instanceof Error ? error.message : 'Invalid image file.',
      )
    }

    const ext = decoded.format === 'png' ? 'png' : 'jpg'
    const fileName = `${access.resourceId}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
    const filePath = join(this.imagesDir, fileName)
    writeFileSync(filePath, bytes, { mode: 0o600 })

    const orderId = access.activeOrderId ?? 'owner-title'
    const expiresAt = access.activeUntilUtc ?? this.requireResource(access.resourceId).validTo

    return this.store.saveBillboardPublication({
      resourceId: access.resourceId,
      orderId,
      mimeType: decoded.mimeType,
      filePath,
      width: decoded.width,
      height: decoded.height,
      publishedBy: access.sessionAddress!,
      publishedAt: this.nowUtc(),
      expiresAt,
    })
  }

  async getBillboardCurrent(rawResourceId: string): Promise<BillboardCurrentView> {
    const resource = this.requireResource(rawResourceId)
    if (resource.serviceType !== 'digital_billboard') {
      throw new HttpError(400, 'NOT_BILLBOARD_RESOURCE', 'The selected resource is not an advertising billboard.')
    }
    const nowUtc = this.nowUtc()
    const pub = this.store.getBillboardPublication(resource.resourceId)
    if (!pub || nowUtc >= pub.expiresAt) {
      if (pub) this.store.clearBillboardPublication(resource.resourceId)
      return {
        resourceId: resource.resourceId,
        active: false,
        orderId: null,
        mimeType: null,
        width: null,
        height: null,
        imageUrl: null,
        expiresAtUtc: null,
        expiresAtTorino: null,
        serverNowUtc: nowUtc,
      }
    }

    // Verify on the server that the associated order (if any) is still active in [startsAt, endsAt).
    if (pub.orderId !== 'owner-title') {
      const order = this.store.getOrder(pub.orderId)
      if (!order || nowUtc < order.startsAt || nowUtc >= order.endsAt) {
        this.store.clearBillboardPublication(resource.resourceId)
        return {
          resourceId: resource.resourceId,
          active: false,
          orderId: null,
          mimeType: null,
          width: null,
          height: null,
          imageUrl: null,
          expiresAtUtc: null,
          expiresAtTorino: null,
          serverNowUtc: nowUtc,
        }
      }
      try {
        const snapshot = await this.runtime.escrowLedger.snapshot()
        const valid = await this.verifyConfirmedOrderOnSnapshot(
          order,
          resource,
          snapshot.hash,
          snapshot.index,
          snapshot.closeTime,
        )
        if (!valid) {
          return {
            resourceId: resource.resourceId,
            active: false,
            orderId: null,
            mimeType: null,
            width: null,
            height: null,
            imageUrl: null,
            expiresAtUtc: null,
            expiresAtTorino: null,
            serverNowUtc: nowUtc,
          }
        }
      } catch {
        // On network loss, do not extend beyond pub.expiresAt; if already expired, it was already rejected above.
      }
    }

    return {
      resourceId: resource.resourceId,
      active: true,
      orderId: pub.orderId,
      mimeType: pub.mimeType,
      width: pub.width,
      height: pub.height,
      imageUrl: `/api/cartelloni/${encodeURIComponent(resource.resourceId)}/immagine-file?v=${pub.id}`,
      expiresAtUtc: pub.expiresAt,
      expiresAtTorino: formatTorinoDateTime(pub.expiresAt),
      serverNowUtc: nowUtc,
    }
  }

  async getBillboardImageBytes(rawResourceId: string): Promise<{
    readonly mimeType: string
    readonly bytes: Buffer
  } | null> {
    const current = await this.getBillboardCurrent(rawResourceId)
    if (!current.active) return null
    const pub = this.store.getBillboardPublication(current.resourceId)
    if (!pub) return null
    return {
      mimeType: pub.mimeType,
      bytes: readFileSync(pub.filePath),
    }
  }

  // --- Simulation of the 4 initial responses & First Exchange ---

  getSampleCadExchange(): SampleOrderExchange {
    const orders = this.store.listOrders('cad')
    const latest = orders[0]
    const cad = this.requireResource('cad')
    const bundle = latest ? (JSON.parse(latest.bundleJson) as RentalBundle) : undefined
    return createSampleCadOrderExchange({
      setup: this.runtime.setup,
      listingId: latest?.listingId ?? 'cad-aug-demo-01',
      revision: latest?.revision ?? 1,
      orderId: latest?.orderId ?? 'order-cad-10xrp-01',
      startsAt: latest?.startsAt,
      endsAt: latest?.endsAt,
      fundBy: latest?.fundBy,
      titleNftId: cad.titleNftId,
      proposalHash: latest?.proposalHash ?? null,
      agreementHash: latest?.agreementHash ?? null,
      passNftId: latest?.passNftId ?? null,
      offerId: latest?.offerId ?? null,
      acceptOfferHash: latest?.acceptOfferHash ?? null,
      createHash: latest?.createHash ?? null,
      escrowObjectId: latest?.escrowObjectId ?? null,
      bundle,
    })
  }

  getSimulationStatus() {
    return {
      mode: this.runtime.mode,
      activePreset: this.activePreset,
      presets: SIMULATED_PRESETS,
      nowUtc: this.nowUtc(),
      nowTorino: formatTorinoDateTime(this.nowUtc()),
    }
  }

  advanceSimulatedTime(seconds: number): { readonly nowUtc: string; readonly nowTorino: string } {
    if (!this.runtime.simulatedNode) {
      throw new HttpError(400, 'NOT_SIMULATED_MODE', 'Time advancement is available only in simulated mode.')
    }
    this.runtime.simulatedNode.advanceSeconds(seconds)
    return {
      nowUtc: this.nowUtc(),
      nowTorino: formatTorinoDateTime(this.nowUtc()),
    }
  }

  async applySimulatedPreset(preset: SimulatedPresetName): Promise<{
    readonly preset: SimulatedPresetName
    readonly order: OrderView | null
    readonly nowUtc: string
    readonly nowTorino: string
  }> {
    if (!this.runtime.simulatedNode) {
      throw new HttpError(
        400,
        'NOT_SIMULATED_MODE',
        'Simulated presets are available only in local simulated mode.',
      )
    }

    this.store.resetDemoDomainData()
    const baseMs = Math.max(Date.now(), this.runtime.nowMillis())
    this.runtime.simulatedNode.setNowMillis(baseMs)
    const nowSec = Math.floor(this.runtime.nowMillis() / 1000)

    const seqId = this.presetCounter++
    const titleValidFrom = formatUtcSecond((nowSec - 60) * 1000)
    const isShortTitle = preset === 'expired_rental_and_license'
    const endsAtSec = nowSec + 120
    const titleValidTo = formatUtcSecond(
      (isShortTitle ? endsAtSec : nowSec + 365 * 24 * 3600) * 1000,
    )

    // Ensure a base title consistent with the selected preset.
    const cadTitleNftId = await this.ensureTitleOnLedger({
      resourceId: 'cad',
      issuerSigner: this.runtime.signers.cadAuthority,
      aliceSigner: this.runtime.signers.alice,
      validFrom: titleValidFrom,
      validTo: titleValidTo,
    })
    const currentCad = this.requireResource('cad')
    this.store.upsertResource({
      ...currentCad,
      titleNftId: cadTitleNftId,
      validFrom: titleValidFrom,
      validTo: titleValidTo,
    })

    if (preset === 'initial_active_license') {
      this.activePreset = preset
      return {
        preset,
        order: null,
        nowUtc: this.nowUtc(),
        nowTorino: formatTorinoDateTime(this.nowUtc()),
      }
    }

    // Create a listing signed by Alice and an order accepted by Bob on CAD.
    const fundBy = formatUtcSecond((nowSec + 30) * 1000)
    const startsAt = formatUtcSecond((nowSec + 60) * 1000)
    const endsAt = formatUtcSecond(endsAtSec * 1000)
    const listingId = `sim-cad-listing-${seqId}`
    const orderId = `sim-cad-order-${seqId}`

    const aliceSession = this.createInternalSession(this.runtime.setup.participants.alice)
    const bobSession = this.createInternalSession(this.runtime.setup.participants.bob)
    const cadAuthSession = this.createInternalSession(this.runtime.setup.participants.cadAuthority)

    try {
      const signedProp = this.signProposalLocally({
        resourceId: 'cad',
        listingId,
        revision: 1,
        startsAt,
        endsAt,
        priceDrops: '10000000',
        role: 'alice',
      })
      this.publishListing(aliceSession, signedProp)

      const signedOrd = this.signOrderLocally({
        listingId,
        revision: 1,
        orderId,
        fundBy,
        role: 'bob',
      })
      let orderView = await this.acceptListingOrder(bobSession, listingId, signedOrd)

      if (preset === 'pending_authority') {
        this.activePreset = preset
        return {
          preset,
          order: orderView,
          nowUtc: this.nowUtc(),
          nowTorino: formatTorinoDateTime(this.nowUtc()),
        }
      }

      orderView = await this.decideOrder(cadAuthSession, orderId, { decision: 'approve' })
      orderView = await this.acceptPassForOrder(bobSession, orderId)

      if (preset === 'pass_delivered_missing_deposit') {
        this.activePreset = preset
        return {
          preset,
          order: orderView,
          nowUtc: this.nowUtc(),
          nowTorino: formatTorinoDateTime(this.nowUtc()),
        }
      }

      orderView = await this.depositEscrowForOrder(bobSession, orderId)

      if (preset === 'active_rental') {
        this.runtime.simulatedNode.advanceSeconds(70)
      } else {
        // expired_rental or expired_rental_and_license
        this.runtime.simulatedNode.advanceSeconds(135)
      }

      this.activePreset = preset
      return {
        preset,
        order: await this.getOrderView(orderId),
        nowUtc: this.nowUtc(),
        nowTorino: formatTorinoDateTime(this.nowUtc()),
      }
    } finally {
      this.store.deleteSession(aliceSession)
      this.store.deleteSession(bobSession)
      this.store.deleteSession(cadAuthSession)
    }
  }

  private createInternalSession(address: string): string {
    const ref = `internal-${randomBytes(12).toString('hex')}`
    this.store.authenticateSession(ref, address, this.runtime.nowMillis())
    return ref
  }
}
