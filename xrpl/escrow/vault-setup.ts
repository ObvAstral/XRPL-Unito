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
      throw new Error(`Indirizzo override XRPL non valido: ${overrideAddress}`)
    }
    return { address: overrideAddress, seed: null }
  }
  const generated = Wallet.generate()
  if (!generated.seed) throw new Error('Generazione seed wallet XRPL fallita')
  return { address: generated.classicAddress, seed: generated.seed }
}

function applyOverride(existing: StoredKeyEntry, overrideAddress?: string): StoredKeyEntry {
  if (overrideAddress === undefined || overrideAddress === existing.address) {
    return existing
  }
  if (!isValidClassicAddress(overrideAddress)) {
    throw new Error(`Indirizzo override XRPL non valido: ${overrideAddress}`)
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
      throw new Error('Formato dev-secrets.json incompatibile con la v2')
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
    throw new Error('Uno o piu’ indirizzi nella configurazione di setup non sono validi')
  }
  if (new Set(all).size !== all.length) {
    throw new Error(
      'Alice, Bob, fornitore CAD, Comune, operatore e i due vault devono avere tutti indirizzi distinti',
    )
  }
}

function walletFromStored(entry: StoredKeyEntry, label: string): Wallet {
  if (!entry.seed) {
    throw new Error(
      `Seed privata assente per ${label} (${entry.address}): impossibile firmare la configurazione iniziale`,
    )
  }
  const wallet = Wallet.fromSeed(entry.seed)
  if (wallet.classicAddress !== entry.address) {
    throw new Error(`La seed salvata per ${label} non corrisponde all’indirizzo ${entry.address}`)
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
      throw new Error(`Faucet Testnet HTTP ${response.status} per ${address}`)
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
      throw new Error(`Transazione di setup ${hash} ancora in verifica sul ledger: riprova tra poco`)
    }
    if (current.state !== 'validated') {
      throw new Error(
        `Transazione di setup ${hash} non validata (stato: ${current.state}, codice: ${current.result ?? 'ignoto'})`,
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
    throw new Error(`Accredito faucet non ancora visibile sul ledger validato per ${entry.address}`)
  }

  // 1. Finanziamento idempotente dei partecipanti e dell'account operativo (solo se sotto soglia).
  for (const role of [
    secrets.participants.alice,
    secrets.participants.bob,
    secrets.participants.cadAuthority,
    secrets.participants.billboardAuthority,
    secrets.participants.operator,
  ]) {
    await ensureParticipantFunded(role)
  }

  // 2. Setup idempotente e riprendibile dei due vault distinti (CAD e Cartellone).
  const configureVault = async (
    scenario: VaultScenario,
    vaultEntry: StoredKeyEntry,
    expectedSigners: readonly [string, string, string],
    reservesInfo: LedgerReserves,
  ): Promise<VaultPublicConfig> => {
    const setupOrderId = `setup:${scenario}`
    const orderedSigners = canonicalSignerAddresses(expectedSigners)

    // Riconcilia prima eventuali tentativi rimasti in sospeso da un avvio precedente.
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
        inspection.reason ?? 'Discrepanza configurazione vault',
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
            inspection.reason ?? 'Discrepanza configurazione vault',
          )
        }
        if (inspection.state !== 'not_found' && inspection.state !== 'needs_funding') {
          funded = true
          break
        }
        await wait(pollIntervalMs)
      }
      if (!funded) {
        throw new Error(`Fondi insufficienti o accredito non validato per il vault ${vaultEntry.address}`)
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

      // Verifica sul ledger validato che SignerList (3 firmatari peso 1, Quorum 2) sia attiva PRIMA di disabilitare la master key.
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
          inspection.reason ?? 'SignerList post-setup incoerente',
        )
      }
      if (!inspection.signerListConfigured) {
        throw new Error(`SignerList non ancora attiva sul ledger per il vault ${vaultEntry.address}`)
      }
    }

    if (inspection.state === 'needs_disable_master') {
      if (!inspection.signerListConfigured) {
        throw new Error(
          `Rifiuto di disabilitare la master key su ${vaultEntry.address} senza SignerList validata`,
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
        inspection.reason ?? 'Verifica finale vault fallita',
      )
    }
    if (inspection.state !== 'ready') {
      throw new Error(
        `Configurazione vault ${scenario} (${vaultEntry.address}) incompleta: stato ${inspection.state}`,
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

  // 3. Controllo emendamento NFTokenMintOffer sullo snapshot validato di Testnet.
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
