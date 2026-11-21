import type { RentalBundle, RentalResource, TitleTerms } from '../agreement/rental.js'
import { splitRentalAmount } from '../escrow/protocol.js'
import type { PublicSetupOutput, VaultResolutionMode, VaultScenario } from './escrow-order.js'

export interface CatalogResourceConfig {
  readonly resourceId: string
  readonly aliases: readonly string[]
  readonly displayName: string
  readonly serviceType: 'cad_portal' | 'digital_billboard'
  readonly scenario: VaultScenario
  readonly authorityName: string
  readonly issuer: string
  readonly alice: string
  readonly titleNftId: string
  readonly validFrom: string
  readonly validTo: string
  readonly vault: string
  readonly vaultSigners: readonly [string, string, string]
  readonly feeBps: number
}

export type SimulatedPresetName =
  | 'initial_active_license'
  | 'pending_authority'
  | 'pass_delivered_missing_deposit'
  | 'active_rental'
  | 'expired_rental'
  | 'expired_rental_and_license'

export interface SimulatedPresetDescriptor {
  readonly id: SimulatedPresetName
  readonly label: string
  readonly description: string
}

export const SIMULATED_PRESETS: readonly SimulatedPresetDescriptor[] = [
  {
    id: 'initial_active_license',
    label: '0 · Before rental',
    description: 'Main title active for Alice, no open orders, and no access for Bob.',
  },
  {
    id: 'pending_authority',
    label: '1 · Awaiting authority',
    description: 'Proposal published by Alice and accepted by Bob; authority has not decided yet.',
  },
  {
    id: 'pass_delivered_missing_deposit',
    label: '2 · Pass delivered, deposit missing',
    description: 'NFT pass delivered to Bob with 1 XRP to authority; 9 XRP escrow deposit missing.',
  },
  {
    id: 'active_rental',
    label: '3 · Active rental',
    description: 'Pass and 9 XRP deposit validated; active period with exclusive right for Bob and Alice suspended.',
  },
  {
    id: 'expired_rental',
    label: '4 · Expired rental',
    description: 'Period ended: Bob loses access, Alice recovers it, and balance matures in the 2-of-3 vault.',
  },
  {
    id: 'expired_rental_and_license',
    label: '5 · Expired rental and license',
    description: 'Main title expires together with the rental: neither Alice nor Bob can access.',
  },
] as const

export interface SampleOrderExchange {
  readonly protocol: 'xrpl-unito:sample-exchange'
  readonly version: 2
  readonly network: 'testnet'
  readonly scenario: 'cad'
  readonly resourceId: 'cad'
  readonly listingId: string
  readonly revision: number
  readonly orderId: string
  readonly startsAt: string
  readonly endsAt: string
  readonly fundBy: string
  readonly split: {
    readonly grossDrops: string
    readonly feeBps: number
    readonly feeDrops: string
    readonly netDrops: string
    readonly summaryXrp: '10 / 1 / 9 XRP'
  }
  readonly participants: {
    readonly alice: string
    readonly bob: string
    readonly authority: string
    readonly operator: string
  }
  readonly vault: {
    readonly address: string
    readonly signers: readonly [string, string, string]
    readonly quorum: 2
  }
  readonly titleNftId: string | null
  readonly proposalHash: string | null
  readonly agreementHash: string | null
  readonly ledgerRefs: {
    readonly passNftId: string | null
    readonly offerId: string | null
    readonly acceptOfferHash: string | null
    readonly createHash: string | null
    readonly escrowObjectId: string | null
  }
  readonly bundle?: RentalBundle
}

export type OrderLifecycleStatus =
  | 'awaiting_authority'
  | 'rejected'
  | 'approved_offer_pending'
  | 'approved_offer_ready'
  | 'pass_delivered_unfunded'
  | 'deposit_verifying'
  | 'confirmed'
  | 'active'
  | 'expired'
  | 'recovery_verifying'
  | 'revoked_refunded'
  | 'revoked_unpaid'
  | 'settled'

export interface VerifiedTestnetTxView {
  readonly key: string
  readonly label: string
  readonly txType: string
  readonly txHash: string
  readonly ledgerIndex: number | null
  readonly explorerUrl: string
}

export interface AccessDecisionView {
  readonly resourceId: string
  readonly serviceType: 'cad_portal' | 'digital_billboard'
  readonly resourceName: string
  readonly authorityName: string
  readonly sessionAddress: string | null
  readonly role: 'alice' | 'bob' | 'authority' | 'guest'
  readonly canAccess: boolean
  readonly httpStatus: 200 | 401 | 403 | 409 | 503
  readonly code:
    | 'ALICE_ACTIVE'
    | 'BOB_ACTIVE'
    | 'ALICE_SUSPENDED'
    | 'WAIT_AUTHORITY'
    | 'PASS_DELIVERED_NO_DEPOSIT'
    | 'CONFIRMED_BEFORE_START'
    | 'RENTAL_EXPIRED'
    | 'LICENSE_EXPIRED'
    | 'NO_RIGHT'
    | 'SESSION_REQUIRED'
    | 'VERIFICATION_PENDING'
    | 'LEDGER_UNAVAILABLE'
  readonly titleState: 'active' | 'expired' | 'not_yet_valid' | 'absent' | 'unavailable'
  readonly headline: string
  readonly reason: string
  readonly activeOrderId: string | null
  readonly activeFromUtc: string | null
  readonly activeUntilUtc: string | null
  readonly activeFromTorino: string | null
  readonly activeUntilTorino: string | null
  readonly nextTransitionAtUtc: string | null
  readonly nextTransitionAtTorino: string | null
  readonly ledgerSnapshotHash: string | null
  readonly ledgerSnapshotIndex: number | null
  readonly serverNowUtc: string
  readonly serverNowTorino: string
  readonly verifiedTxs?: readonly VerifiedTestnetTxView[]
}

export interface SettlementUiView {
  readonly escrowState: 'not_created' | 'pending' | 'locked' | 'releasable' | 'credited_to_vault' | 'missing' | 'mismatch' | 'unavailable'
  readonly escrowLabel: string
  readonly payoutPhase: 'not_ready' | 'awaiting_signatures' | 'awaiting_ledger' | 'validated' | 'failed' | 'expired'
  readonly payoutLabel: string
  readonly resolutionMode: VaultResolutionMode | null
  readonly beneficiary: string | null
  readonly collectedSigners: readonly string[]
  readonly allowedSigners: readonly string[]
  readonly preparedTransactionJson: string | null
}

export function normalizeCatalogResourceId(id: string): string {
  const normalized = id.trim().toLowerCase()
  if (normalized === 'cad' || normalized === 'cad-01') return 'cad'
  if (normalized === 'torino-01') return 'torino-01'
  return id.trim()
}

export function toTitleTerms(resource: CatalogResourceConfig): TitleTerms {
  return {
    resourceId: resource.resourceId,
    issuer: resource.issuer,
    alice: resource.alice,
    validFrom: resource.validFrom,
    validTo: resource.validTo,
  }
}

export function toRentalResource(resource: CatalogResourceConfig): RentalResource {
  return {
    ...toTitleTerms(resource),
    titleNftId: resource.titleNftId,
    vault: resource.vault,
  }
}

export function formatUtcSecond(date: Date | number): string {
  const millis = typeof date === 'number' ? date : date.valueOf()
  return new Date(Math.floor(millis / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function formatTorinoDateTime(utcIso: string): string {
  const parsed = new Date(utcIso)
  if (!Number.isFinite(parsed.valueOf())) return utcIso
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(parsed)
  return `${formatted} (Europe/Rome)`
}

export function createSampleCadOrderExchange(params: {
  readonly setup: PublicSetupOutput
  readonly listingId?: string
  readonly revision?: number
  readonly orderId?: string
  readonly startsAt?: string
  readonly endsAt?: string
  readonly fundBy?: string
  readonly titleNftId?: string | null
  readonly proposalHash?: string | null
  readonly agreementHash?: string | null
  readonly passNftId?: string | null
  readonly offerId?: string | null
  readonly acceptOfferHash?: string | null
  readonly createHash?: string | null
  readonly escrowObjectId?: string | null
  readonly bundle?: RentalBundle
}): SampleOrderExchange {
  const nowSec = Math.floor(Date.now() / 1000)
  const startsAt = params.startsAt ?? formatUtcSecond((nowSec + 180) * 1000)
  const endsAt = params.endsAt ?? formatUtcSecond((nowSec + 360) * 1000)
  const fundBy = params.fundBy ?? formatUtcSecond((nowSec + 120) * 1000)
  const split = splitRentalAmount('10000000', 1000)

  return {
    protocol: 'xrpl-unito:sample-exchange',
    version: 2,
    network: 'testnet',
    scenario: 'cad',
    resourceId: 'cad',
    listingId: params.listingId ?? 'cad-aug-demo-01',
    revision: params.revision ?? 1,
    orderId: params.orderId ?? 'order-cad-10xrp-01',
    startsAt,
    endsAt,
    fundBy,
    split: {
      ...split,
      summaryXrp: '10 / 1 / 9 XRP',
    },
    participants: {
      alice: params.setup.participants.alice,
      bob: params.setup.participants.bob,
      authority: params.setup.participants.cadAuthority,
      operator: params.setup.participants.operator,
    },
    vault: {
      address: params.setup.vaults.cad.address,
      signers: params.setup.vaults.cad.signers,
      quorum: 2,
    },
    titleNftId: params.titleNftId ?? null,
    proposalHash: params.proposalHash ?? null,
    agreementHash: params.agreementHash ?? null,
    ledgerRefs: {
      passNftId: params.passNftId ?? null,
      offerId: params.offerId ?? null,
      acceptOfferHash: params.acceptOfferHash ?? null,
      createHash: params.createHash ?? null,
      escrowObjectId: params.escrowObjectId ?? null,
    },
    ...(params.bundle ? { bundle: params.bundle } : {}),
  }
}
