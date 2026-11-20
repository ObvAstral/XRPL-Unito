import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import {
  RippledError,
  decode,
  hashes,
  type LedgerEntry,
  type Request,
  type SubmittableTransaction,
} from 'xrpl'
import { AttemptStore } from './attempts.js'
import { EscrowLedger, VaultConfigMismatchError, type RpcClient } from './ledger.js'
import {
  AMENDMENTS_LEDGER_ENTRY_ID,
  ASF_DISABLE_MASTER,
  LSF_DISABLE_MASTER,
  NFTOKEN_MINT_OFFER_AMENDMENT_ID,
  RIPPLE_EPOCH_SECONDS,
} from './protocol.js'
import { loadOrInitSecrets, runSetupWallets } from './vault-setup.js'

interface SimulatedAccount {
  address: string
  balanceDrops: bigint
  sequence: number
  flags: number
  ownerCount: number
  regularKey?: string
  signerList?: {
    SignerQuorum: number
    SignerEntries: Array<{ SignerEntry: { Account: string; SignerWeight: number } }>
  }
}

function createSetupHarness(t: TestContext, options?: { mintOfferEnabled?: boolean }) {
  const stateDir = mkdtempSync(join(tmpdir(), 'ixh26-vault-setup-'))
  let attempts = new AttemptStore(stateDir)
  t.after(() => {
    attempts.close()
    rmSync(stateDir, { recursive: true, force: true })
  })

  let ledgerIndex = 500
  const closeTime = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_SECONDS
  const ledgerHashFor = (idx: number) => idx.toString(16).padStart(64, 'A').toUpperCase()

  const accounts = new Map<string, SimulatedAccount>()
  const validatedTxs = new Map<string, unknown>()
  const submittedBlobs: string[] = []
  const faucetCalls: string[] = []
  let mintOfferEnabled = options?.mintOfferEnabled ?? true
  let dropNextDisableMasterSubmit = false

  const applyTransaction = (blob: string) => {
    const hash = hashes.hashSignedTx(blob).toUpperCase()
    const tx = decode(blob) as Record<string, unknown>
    const sender = String(tx.Account)
    const acct = accounts.get(sender)
    if (!acct) throw new Error(`Account ${sender} inesistente nel simulatore`)

    const fee = BigInt(String(tx.Fee ?? '12'))
    acct.balanceDrops -= fee
    acct.sequence += 1

    if (tx.TransactionType === 'SignerListSet') {
      const entries = tx.SignerEntries as Array<{
        SignerEntry: { Account: string; SignerWeight: number }
      }>
      if (!acct.signerList) acct.ownerCount += 1
      acct.signerList = {
        SignerQuorum: Number(tx.SignerQuorum),
        SignerEntries: entries,
      }
    } else if (tx.TransactionType === 'AccountSet') {
      if (tx.SetFlag === ASF_DISABLE_MASTER) {
        if (!acct.signerList && !acct.regularKey) {
          throw new Error('tecNO_ALTERNATIVE_KEY')
        }
        acct.flags |= LSF_DISABLE_MASTER
      }
    }

    ledgerIndex += 1
    const lgrHash = ledgerHashFor(ledgerIndex)
    validatedTxs.set(hash, {
      hash,
      ledger_index: ledgerIndex,
      ledger_hash: lgrHash,
      validated: true,
      tx_json: { ...tx, date: closeTime },
      meta: { TransactionIndex: 0, TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
    })
  }

  const client: RpcClient = {
    async request(req: Request) {
      switch (req.command) {
        case 'server_state':
          return {
            result: {
              state: {
                validated_ledger: {
                  base_fee: 10,
                  close_time: closeTime,
                  hash: ledgerHashFor(ledgerIndex),
                  reserve_base: 1_000_000,
                  reserve_inc: 200_000,
                  seq: ledgerIndex,
                },
              },
            },
          } as never
        case 'ledger': {
          const requestedIndex =
            typeof req.ledger_index === 'number' ? req.ledger_index : ledgerIndex
          const requestedHash =
            typeof req.ledger_hash === 'string'
              ? req.ledger_hash.toUpperCase()
              : ledgerHashFor(requestedIndex)
          return {
            result: {
              ledger_hash: requestedHash,
              ledger_index: requestedIndex,
              validated: true,
              ledger: { close_time: closeTime },
            },
          } as never
        }
        case 'ledger_entry': {
          if (req.index === AMENDMENTS_LEDGER_ENTRY_ID) {
            return {
              result: {
                index: AMENDMENTS_LEDGER_ENTRY_ID,
                validated: true,
                ledger_current_index: ledgerIndex,
                node: {
                  LedgerEntryType: 'Amendments',
                  Flags: 0,
                  Amendments: mintOfferEnabled ? [NFTOKEN_MINT_OFFER_AMENDMENT_ID] : [],
                } satisfies Partial<LedgerEntry.Amendments>,
              },
            } as never
          }
          throw new RippledError('entryNotFound', { error: 'entryNotFound' })
        }
        case 'account_info': {
          const acct = accounts.get(req.account)
          if (!acct) {
            throw new RippledError('Account not found', { error: 'actNotFound' })
          }
          return {
            result: {
              validated: true,
              ledger_index: ledgerIndex,
              account_data: {
                LedgerEntryType: 'AccountRoot',
                Account: acct.address,
                Balance: acct.balanceDrops.toString(),
                Flags: acct.flags,
                OwnerCount: acct.ownerCount,
                Sequence: acct.sequence,
                ...(acct.regularKey ? { RegularKey: acct.regularKey } : {}),
              },
              ...(req.signer_lists
                ? {
                    signer_lists: acct.signerList
                      ? [
                          {
                            LedgerEntryType: 'SignerList',
                            Flags: 65536,
                            SignerListID: 0,
                            SignerQuorum: acct.signerList.SignerQuorum,
                            SignerEntries: acct.signerList.SignerEntries,
                          },
                        ]
                      : [],
                  }
                : {}),
            },
          } as never
        }
        case 'account_objects':
          return {
            result: {
              account: req.account,
              account_objects: [],
              validated: true,
            },
          } as never
        case 'tx': {
          const found = validatedTxs.get((req.transaction ?? '').toUpperCase())
          if (!found) {
            throw new RippledError('txnNotFound', { error: 'txnNotFound', searched_all: true })
          }
          return { result: found } as never
        }
        case 'submit': {
          submittedBlobs.push(req.tx_blob)
          const preview = decode(req.tx_blob) as Record<string, unknown>
          if (dropNextDisableMasterSubmit && preview.TransactionType === 'AccountSet') {
            dropNextDisableMasterSubmit = false
            applyTransaction(req.tx_blob)
            throw new Error('Timeout RPC simulato dopo ricezione del nodo')
          }
          applyTransaction(req.tx_blob)
          return { result: { engine_result: 'tesSUCCESS' } } as never
        }
        default:
          throw new Error(`Comando RPC inatteso: ${req.command}`)
      }
    },
    async autofill<T extends SubmittableTransaction>(tx: T): Promise<T> {
      const acct = accounts.get(tx.Account)
      if (!acct) throw new Error(`Account ${tx.Account} non trovato in autofill`)
      return {
        ...tx,
        Sequence: acct.sequence,
        Fee: '12',
      }
    },
  }

  const faucetFund = async (address: string) => {
    faucetCalls.push(address)
    const existing = accounts.get(address)
    if (existing) {
      existing.balanceDrops += 100_000_000n
    } else {
      accounts.set(address, {
        address,
        balanceDrops: 100_000_000n,
        sequence: 1,
        flags: 0,
        ownerCount: 0,
      })
    }
    ledgerIndex += 1
  }

  return {
    stateDir,
    accounts,
    submittedBlobs,
    faucetCalls,
    get ledger() {
      return new EscrowLedger(client)
    },
    get attempts() {
      return attempts
    },
    faucetFund,
    setMintOfferEnabled(enabled: boolean) {
      mintOfferEnabled = enabled
    },
    simulateDisableMasterTimeoutOnce() {
      dropNextDisableMasterSubmit = true
    },
    reopenAttempts() {
      attempts.close()
      attempts = new AttemptStore(stateDir)
      return attempts
    },
  }
}

test('due esecuzioni di setup-wallets: configura 2 vault distinti 2-su-3 con master disabilitata e al secondo avvio non invia transazioni', async (t) => {
  const h = createSetupHarness(t, { mintOfferEnabled: true })

  const first = await runSetupWallets({
    stateDir: h.stateDir,
    ledger: h.ledger,
    attempts: h.attempts,
    faucetFund: h.faucetFund,
    pollIntervalMs: 1,
    wait: async () => {},
  })

  const { cad, billboard } = first.publicOutput.vaults
  const { alice, bob, cadAuthority, billboardAuthority, operator } = first.publicOutput.participants

  assert.notEqual(cad.address, billboard.address)
  assert.notEqual(cadAuthority, billboardAuthority)
  assert.equal(new Set([alice, bob, cadAuthority, billboardAuthority, operator, cad.address, billboard.address]).size, 7)

  assert.equal(cad.quorum, 2)
  assert.equal(cad.masterDisabled, true)
  assert.deepEqual([...cad.signers].sort(), [alice, bob, cadAuthority].sort())

  assert.equal(billboard.quorum, 2)
  assert.equal(billboard.masterDisabled, true)
  assert.deepEqual([...billboard.signers].sort(), [alice, bob, billboardAuthority].sort())

  assert.equal(first.publicOutput.capabilities.nftokenMintOfferEnabled, true)
  assert.equal(h.faucetCalls.length, 7)
  // 2 transazioni per vault: SignerListSet seguita da AccountSet(asfDisableMaster) = 4 totali.
  assert.equal(h.submittedBlobs.length, 4)

  const cadState = h.accounts.get(cad.address)!
  assert.ok((cadState.flags & LSF_DISABLE_MASTER) !== 0)
  assert.equal(cadState.regularKey, undefined)

  // Seconda esecuzione dopo riapertura di AttemptStore: zero nuove transazioni e zero chiamate faucet.
  const reopened = h.reopenAttempts()
  h.setMintOfferEnabled(false)

  const second = await runSetupWallets({
    stateDir: h.stateDir,
    ledger: h.ledger,
    attempts: reopened,
    faucetFund: h.faucetFund,
    pollIntervalMs: 1,
    wait: async () => {},
  })

  assert.equal(second.publicOutput.vaults.cad.address, cad.address)
  assert.equal(second.publicOutput.vaults.billboard.address, billboard.address)
  assert.equal(second.publicOutput.capabilities.nftokenMintOfferEnabled, false)
  assert.equal(h.faucetCalls.length, 7)
  assert.equal(h.submittedBlobs.length, 4)
})

test('riprende senza duplicare transazioni dopo perdita risposta su AccountSet asfDisableMaster e rileva discrepanze SignerList', async (t) => {
  const h = createSetupHarness(t)
  h.simulateDisableMasterTimeoutOnce()

  const result = await runSetupWallets({
    stateDir: h.stateDir,
    ledger: h.ledger,
    attempts: h.attempts,
    faucetFund: h.faucetFund,
    pollIntervalMs: 1,
    wait: async () => {},
  })

  assert.equal(result.publicOutput.vaults.cad.masterDisabled, true)
  assert.equal(h.submittedBlobs.length, 4)

  // Simula una discrepanza sul vault registrato (es. RegularKey malevola o firmatari errati).
  const secrets = loadOrInitSecrets(h.stateDir)
  const corrupted = h.accounts.get(secrets.vaultBootstrap.cad.address)!
  corrupted.signerList = {
    SignerQuorum: 1,
    SignerEntries: corrupted.signerList!.SignerEntries,
  }

  await assert.rejects(
    runSetupWallets({
      stateDir: h.stateDir,
      ledger: h.ledger,
      attempts: h.attempts,
      faucetFund: h.faucetFund,
      pollIntervalMs: 1,
      wait: async () => {},
    }),
    VaultConfigMismatchError,
  )
})
