import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Wallet, isValidClassicAddress, type Client } from 'xrpl'
import type {
  PublicSetupOutput,
  TestnetCapabilities,
  VaultPublicConfig,
  VaultScenario,
} from '../shared/escrow-order.js'
import { createWalletSigner } from '../shared/signer.js'
import { AttemptStore } from './attempts.js'
import {
  EscrowLedger,
  VaultConfigMismatchError,
  type LedgerReserves,
} from './ledger.js'
import {
  NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  buildVaultDisableMaster,
  buildVaultSignerListSet,
  canonicalSignerAddresses,
} from './protocol.js'
import { EscrowService, type AttemptResult } from './service.js'

const SETUP_HASH_PLACEHOLDER = '0'.repeat(64)
const DEFAULT_VAULT_SPENDABLE_MARGIN_DROPS = 2_000_000n
const DEFAULT_PARTICIPANT_MIN_MARGIN_DROPS = 2_000_000n

export interface StoredKeyEntry {
  readonly address: string
  readonly seed: string | null
}

export interface DevSecretsFile {
  readonly version: 2
  readonly network: 'testnet'
  readonly participants: {
    readonly alice: StoredKeyEntry
    readonly bob: StoredKeyEntry
    readonly cadAuthority: StoredKeyEntry
    readonly billboardAuthority: StoredKeyEntry
    readonly operator: StoredKeyEntry
  }
  readonly vaultBootstrap: {
    readonly cad: StoredKeyEntry
    readonly billboard: StoredKeyEntry
  }
}

export interface ParticipantAddressOverrides {
  readonly alice?: string
  readonly bob?: string
  readonly cadAuthority?: string
  readonly billboardAuthority?: string
  readonly operator?: string
}

export type FaucetFunder = (address: string, wallet: Wallet | null) => Promise<void>

export interface SetupWalletsOptions {
  readonly stateDir: string
  readonly ledger: EscrowLedger
  readonly attempts: AttemptStore
  readonly faucetFund: FaucetFunder
  readonly participantOverrides?: ParticipantAddressOverrides
  readonly minVaultSpendableDrops?: bigint
  readonly minParticipantMarginDrops?: bigint
  readonly pollIntervalMs?: number
  readonly maxSettlePolls?: number
  readonly wait?: (ms: number) => Promise<void>
}

function createKeyEntry(overrideAddress?: string): StoredKeyEntry {
  if (overrideAddress !== undefined) {
    if (!isValidClassicAddress(overrideAddress)) {
      throw new Error(`Invalid override XRPL address: ${overrideAddress}`)
    }
    return { address: overrideAddress, seed: null }
  }
  const generated = Wallet.generate()
  if (!generated.seed) throw new Error('XRPL wallet seed generation failed')
  return { address: generated.classicAddress, seed: generated.seed }
}

function applyOverride(existing: StoredKeyEntry, overrideAddress?: string): StoredKeyEntry {
  if (overrideAddress === undefined || overrideAddress === existing.address) {
    return existing
  }
  if (!isValidClassicAddress(overrideAddress)) {
    throw new Error(`Invalid override XRPL address: ${overrideAddress}`)
  }
  return { address: overrideAddress, seed: null }
}

function writePrivateJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  chmodSync(filePath, 0o600)
}

export function loadOrInitSecrets(
  stateDir: string,
  overrides?: ParticipantAddressOverrides,
): DevSecretsFile {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  chmodSync(stateDir, 0o700)

  const secretsPath = join(stateDir, 'dev-secrets.json')
  if (existsSync(secretsPath)) {
    const parsed = JSON.parse(readFileSync(secretsPath, 'utf8')) as DevSecretsFile
    if (parsed.version !== 2 || parsed.network !== 'testnet') {
      throw new Error('Incompatible dev-secrets.json format (v2 expected)')
    }
    const updated: DevSecretsFile = {
      version: 2,
      network: 'testnet',
      participants: {
        alice: applyOverride(parsed.participants.alice, overrides?.alice),
        bob: applyOverride(parsed.participants.bob, overrides?.bob),
        cadAuthority: applyOverride(parsed.participants.cadAuthority, overrides?.cadAuthority),
        billboardAuthority: applyOverride(
          parsed.participants.billboardAuthority,
          overrides?.billboardAuthority,
        ),
        operator: applyOverride(parsed.participants.operator, overrides?.operator),
      },
      vaultBootstrap: parsed.vaultBootstrap,
    }
    writePrivateJson(secretsPath, updated)
    return updated
  }

  const created: DevSecretsFile = {
    version: 2,
    network: 'testnet',
    participants: {
      alice: createKeyEntry(overrides?.alice),
      bob: createKeyEntry(overrides?.bob),
      cadAuthority: createKeyEntry(overrides?.cadAuthority),
      billboardAuthority: createKeyEntry(overrides?.billboardAuthority),
      operator: createKeyEntry(overrides?.operator),
    },
    vaultBootstrap: {
      cad: createKeyEntry(),
      billboard: createKeyEntry(),
    },
  }
  writePrivateJson(secretsPath, created)
  return created
}

function assertDistinctSetupAddresses(secrets: DevSecretsFile): void {
  const all = [
    secrets.participants.alice.address,
    secrets.participants.bob.address,
    secrets.participants.cadAuthority.address,
    secrets.participants.billboardAuthority.address,
    secrets.participants.operator.address,
    secrets.vaultBootstrap.cad.address,
    secrets.vaultBootstrap.billboard.address,
  ]
  if (!all.every((addr) => isValidClassicAddress(addr))) {
    throw new Error('One or more addresses in setup configuration are invalid')
  }
  if (new Set(all).size !== all.length) {
    throw new Error(
      'Alice, Bob, CAD provider, Municipality, operator, and both vaults must all have distinct addresses',
    )
  }
}

function walletFromStored(entry: StoredKeyEntry, label: string): Wallet {
  if (!entry.seed) {
    throw new Error(
      `Missing private seed for ${label} (${entry.address}): cannot sign initial configuration`,
    )
  }
  const wallet = Wallet.fromSeed(entry.seed)
  if (wallet.classicAddress !== entry.address) {
    throw new Error(`Saved seed for ${label} does not match address ${entry.address}`)
  }
  return wallet
}

export function createTestnetFaucetFunder(client: Client): FaucetFunder {
  return async (address: string, wallet: Wallet | null) => {
    if (wallet) {
      await client.fundWallet(wallet)
      return
    }
    const response = await fetch('https://faucet.altnet.rippletest.net/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: address }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Testnet Faucet HTTP ${response.status} for ${address}`)
    }
  }
}

export async function runSetupWallets(options: SetupWalletsOptions): Promise<{
  readonly secrets: DevSecretsFile
  readonly publicOutput: PublicSetupOutput
  readonly publicConfigPath: string
}> {
  const {
    stateDir,
    ledger,
    attempts,
    faucetFund,
    participantOverrides,
    minVaultSpendableDrops = DEFAULT_VAULT_SPENDABLE_MARGIN_DROPS,
    minParticipantMarginDrops = DEFAULT_PARTICIPANT_MIN_MARGIN_DROPS,
    pollIntervalMs = 1500,
    maxSettlePolls = 15,
    wait = (ms: number) => sleep(ms),
  } = options

  const secrets = loadOrInitSecrets(stateDir, participantOverrides)
  assertDistinctSetupAddresses(secrets)

  const service = new EscrowService(ledger, attempts)
  const reserves = await ledger.readReserves()

  const settleAttempt = async (hash: string): Promise<AttemptResult> => {
    let current = await service.reconcile(hash, true)
    for (let i = 0; i < maxSettlePolls && current.state === 'pending'; i++) {
      await wait(pollIntervalMs)
      current = await service.reconcile(hash, i === 0)
    }
    if (current.state === 'pending') {
      throw new Error(`Setup transaction ${hash} still verifying on ledger: retry shortly`)
    }
    if (current.state !== 'validated') {
      throw new Error(
        `Setup transaction ${hash} not validated (state: ${current.state}, code: ${current.result ?? 'unknown'})`,
      )
    }
    return current
  }

  const ensureParticipantFunded = async (entry: StoredKeyEntry): Promise<void> => {
    const required = reserves.reserveBaseDrops + minParticipantMarginDrops
    const snap = await ledger.snapshot()
    const currentBalance = await ledger.accountBalanceDrops(entry.address, snap)
    if (currentBalance !== null && currentBalance >= required) {
      return
    }
    const maybeWallet = entry.seed ? Wallet.fromSeed(entry.seed) : null
    await faucetFund(entry.address, maybeWallet)

    for (let i = 0; i < maxSettlePolls; i++) {
      const checkSnap = await ledger.snapshot()
      const updated = await ledger.accountBalanceDrops(entry.address, checkSnap)
      if (updated !== null && updated >= required) return
      await wait(pollIntervalMs)
    }
    throw new Error(`Faucet credit not yet visible on validated ledger for ${entry.address}`)
  }

  // 1. Idempotent funding of participants and operational account (only if below threshold).
  for (const role of [
    secrets.participants.alice,
    secrets.participants.bob,
    secrets.participants.cadAuthority,
    secrets.participants.billboardAuthority,
    secrets.participants.operator,
  ]) {
    await ensureParticipantFunded(role)
  }

  // 2. Idempotent and resumable setup of both distinct vaults (CAD and Billboard).
  const configureVault = async (
    scenario: VaultScenario,
    vaultEntry: StoredKeyEntry,
    expectedSigners: readonly [string, string, string],
    reservesInfo: LedgerReserves,
  ): Promise<VaultPublicConfig> => {
    const setupOrderId = `setup:${scenario}`
    const orderedSigners = canonicalSignerAddresses(expectedSigners)

    // Reconcile any in-flight attempts from a previous run first.
    for (const action of ['vault_signer_list', 'vault_disable_master'] as const) {
      const active = attempts.active(setupOrderId, action)
      if (active?.state === 'pending') {
        await settleAttempt(active.hash)
      }
    }

    let snapshot = await ledger.snapshot()
    let inspection = await ledger.inspectVaultAccount(
      vaultEntry.address,
      orderedSigners,
      reservesInfo,
      minVaultSpendableDrops,
      snapshot,
    )

    if (inspection.state === 'mismatch') {
      throw new VaultConfigMismatchError(
        vaultEntry.address,
        inspection.reason ?? 'Vault configuration mismatch',
      )
    }

    if (inspection.state === 'ready') {
      return {
        scenario,
        address: vaultEntry.address,
        signers: orderedSigners,
        quorum: 2,
        masterDisabled: true,
        spendableDrops: inspection.spendableDrops.toString(),
      }
    }

    if (inspection.state === 'not_found' || inspection.state === 'needs_funding') {
      const maybeVaultWallet = vaultEntry.seed ? Wallet.fromSeed(vaultEntry.seed) : null
      await faucetFund(vaultEntry.address, maybeVaultWallet)

      let funded = false
      for (let i = 0; i < maxSettlePolls; i++) {
        snapshot = await ledger.snapshot()
        inspection = await ledger.inspectVaultAccount(
          vaultEntry.address,
          orderedSigners,
          reservesInfo,
          minVaultSpendableDrops,
          snapshot,
        )
        if (inspection.state === 'mismatch') {
          throw new VaultConfigMismatchError(
            vaultEntry.address,
            inspection.reason ?? 'Vault configuration mismatch',
          )
        }
        if (inspection.state !== 'not_found' && inspection.state !== 'needs_funding') {
          funded = true
          break
        }
        await wait(pollIntervalMs)
      }
      if (!funded) {
        throw new Error(`Insufficient funds or unvalidated credit for vault ${vaultEntry.address}`)
      }
    }

    if (inspection.state === 'needs_signer_list') {
      const masterWallet = walletFromStored(vaultEntry, `vault ${scenario}`)
      const signer = createWalletSigner(masterWallet)
      snapshot = await ledger.snapshot()
      const tx = buildVaultSignerListSet(vaultEntry.address, orderedSigners)
      const submitted = await service.signSingleAndSubmit(
        setupOrderId,
        SETUP_HASH_PLACEHOLDER,
        'vault_signer_list',
        tx,
        snapshot,
        signer,
        null,
        { scenario, quorum: 2 },
      )
      await settleAttempt(submitted.hash)

      // Verify on validated ledger that SignerList (3 signers weight 1, Quorum 2) is active BEFORE disabling master key.
      snapshot = await ledger.snapshot()
      inspection = await ledger.inspectVaultAccount(
        vaultEntry.address,
        orderedSigners,
        reservesInfo,
        minVaultSpendableDrops,
        snapshot,
      )
      if (inspection.state === 'mismatch') {
        throw new VaultConfigMismatchError(
          vaultEntry.address,
          inspection.reason ?? 'Inconsistent post-setup SignerList',
        )
      }
      if (!inspection.signerListConfigured) {
        throw new Error(`SignerList not yet active on ledger for vault ${vaultEntry.address}`)
      }
    }

    if (inspection.state === 'needs_disable_master') {
      if (!inspection.signerListConfigured) {
        throw new Error(
          `Refusing to disable master key on ${vaultEntry.address} without validated SignerList`,
        )
      }
      const masterWallet = walletFromStored(vaultEntry, `vault ${scenario}`)
      const signer = createWalletSigner(masterWallet)
      snapshot = await ledger.snapshot()
      const tx = buildVaultDisableMaster(vaultEntry.address)
      const submitted = await service.signSingleAndSubmit(
        setupOrderId,
        SETUP_HASH_PLACEHOLDER,
        'vault_disable_master',
        tx,
        snapshot,
        signer,
        null,
        { scenario, setFlag: 4 },
      )
      await settleAttempt(submitted.hash)

      snapshot = await ledger.snapshot()
      inspection = await ledger.inspectVaultAccount(
        vaultEntry.address,
        orderedSigners,
        reservesInfo,
        minVaultSpendableDrops,
        snapshot,
      )
    }

    if (inspection.state === 'mismatch') {
      throw new VaultConfigMismatchError(
        vaultEntry.address,
        inspection.reason ?? 'Final vault verification failed',
      )
    }
    if (inspection.state !== 'ready') {
      throw new Error(
        `Vault ${scenario} (${vaultEntry.address}) setup incomplete: state ${inspection.state}`,
      )
    }

    return {
      scenario,
      address: vaultEntry.address,
      signers: orderedSigners,
      quorum: 2,
      masterDisabled: true,
      spendableDrops: inspection.spendableDrops.toString(),
    }
  }

  const cadVault = await configureVault(
    'cad',
    secrets.vaultBootstrap.cad,
    [
      secrets.participants.alice.address,
      secrets.participants.bob.address,
      secrets.participants.cadAuthority.address,
    ],
    reserves,
  )

  const billboardVault = await configureVault(
    'billboard',
    secrets.vaultBootstrap.billboard,
    [
      secrets.participants.alice.address,
      secrets.participants.bob.address,
      secrets.participants.billboardAuthority.address,
    ],
    reserves,
  )

  // 3. Check NFTokenMintOffer amendment on the validated Testnet snapshot.
  const finalSnapshot = await ledger.snapshot()
  const nftokenMintOfferEnabled = await ledger.isAmendmentEnabled(
    finalSnapshot,
    NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  )

  const capabilities: TestnetCapabilities = {
    nftokenMintOfferEnabled,
    nftokenMintOfferAmendmentId: NFTOKEN_MINT_OFFER_AMENDMENT_ID,
    checkedLedgerHash: finalSnapshot.hash,
    checkedLedgerIndex: finalSnapshot.index,
    reserveBaseDrops: reserves.reserveBaseDrops.toString(),
    reserveIncDrops: reserves.reserveIncDrops.toString(),
  }

  const publicOutput: PublicSetupOutput = {
    network: 'testnet',
    participants: {
      alice: secrets.participants.alice.address,
      bob: secrets.participants.bob.address,
      cadAuthority: secrets.participants.cadAuthority.address,
      billboardAuthority: secrets.participants.billboardAuthority.address,
      operator: secrets.participants.operator.address,
    },
    vaults: {
      cad: cadVault,
      billboard: billboardVault,
    },
    capabilities,
  }

  const publicConfigPath = join(stateDir, 'public-config.json')
  writeFileSync(publicConfigPath, `${JSON.stringify(publicOutput, null, 2)}\n`, { mode: 0o644 })

  return { secrets, publicOutput, publicConfigPath }
}
