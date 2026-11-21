import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AttemptStore } from './escrow/attempts.js'
import { connectTestnet } from './escrow/ledger.js'
import { normalizeTestnetNode } from './shared/testnet-node.js'
import {
  createTestnetFaucetFunder,
  runSetupWallets,
  type ParticipantAddressOverrides,
} from './escrow/vault-setup.js'

const defaultStateDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.xrpl-local')

const usage = `Wallet and 2-of-3 Vault Setup · XRPL Testnet (v2)

Usage:
  npm --prefix xrpl run setup:wallets -- [--state-dir <dir>] [--node ripple|xrplLabs] [--participants <file.json>]

Options:
  --state-dir <dir>         Local directory for dev secrets (0600), SQLite attempts, and public-config.json
                            (default: xrpl/.xrpl-local)
  --node <ripple|xrplLabs>  Testnet WebSocket endpoint (default: ripple, or env XRPL_TESTNET_NODE; alias xrpl-labs)
  --participants <file>     Optional JSON with pre-assigned addresses for alice, bob, cadAuthority,
                            billboardAuthority, operator

Stdout output:
  JSON with public participant addresses, addresses and signers of both vaults (cad, billboard),
  and the validated NFTokenMintOffer amendment result for Person A and Person C.
`

interface ParsedCliArgs {
  readonly help: boolean
  readonly stateDir: string
  readonly node: 'ripple' | 'xrplLabs'
  readonly participantOverrides?: ParticipantAddressOverrides
}

function parseArgs(argv: readonly string[]): ParsedCliArgs {
  let stateDir = process.env.IXH26_STATE_DIR
    ? resolve(process.env.IXH26_STATE_DIR)
    : defaultStateDir
  let rawNode = process.env.XRPL_TESTNET_NODE ?? 'ripple'
  let participantOverrides: ParticipantAddressOverrides | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      return { help: true, stateDir, node: 'ripple' }
    }
    if (arg === '--state-dir') {
      const next = argv[++i]
      if (!next) throw new Error('Missing argument after --state-dir')
      stateDir = resolve(next)
      continue
    }
    if (arg === '--node') {
      const next = argv[++i]
      if (!next) throw new Error('Missing argument after --node')
      rawNode = next
      continue
    }
    if (arg === '--participants') {
      const next = argv[++i]
      if (!next) throw new Error('Missing argument after --participants')
      participantOverrides = JSON.parse(readFileSync(resolve(next), 'utf8')) as ParticipantAddressOverrides
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return { help: false, stateDir, node: normalizeTestnetNode(rawNode), participantOverrides }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage)
    return
  }

  const attempts = new AttemptStore(args.stateDir)
  const { client, ledger } = await connectTestnet(args.node)
  try {
    const { publicOutput, publicConfigPath } = await runSetupWallets({
      stateDir: args.stateDir,
      ledger,
      attempts,
      faucetFund: createTestnetFaucetFunder(client),
      participantOverrides: args.participantOverrides,
    })
    process.stderr.write(`Public configuration saved to: ${publicConfigPath}\n`)
    process.stdout.write(`${JSON.stringify(publicOutput, null, 2)}\n`)
  } finally {
    attempts.close()
    await client.disconnect()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error during setup-wallets'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
