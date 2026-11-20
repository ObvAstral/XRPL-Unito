import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AttemptStore } from './escrow/attempts.js'
import { connectTestnet } from './escrow/ledger.js'
import {
  createTestnetFaucetFunder,
  runSetupWallets,
  type ParticipantAddressOverrides,
} from './escrow/vault-setup.js'

const defaultStateDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.xrpl-local')

const usage = `Setup Wallet e Vault 2-su-3 · XRPL Testnet (v2)

Uso:
  npm --prefix xrpl run setup:wallets -- [--state-dir <dir>] [--node ripple|xrplLabs] [--participants <file.json>]

Opzioni:
  --state-dir <dir>         Directory locale per segreti dev (0600), tentativi SQLite e public-config.json
                            (default: xrpl/.xrpl-local)
  --node <ripple|xrplLabs>  Endpoint WebSocket Testnet (default: ripple, oppure env XRPL_TESTNET_NODE)
  --participants <file>     JSON opzionale con indirizzi gia' assegnati per alice, bob, cadAuthority,
                            billboardAuthority, operator

Output su stdout:
  JSON con indirizzi pubblici dei partecipanti, indirizzi e firmatari dei due vault (cad, billboard)
  ed esito validato dell'emendamento NFTokenMintOffer da consegnare a Persona A e Persona C.
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
      if (!next) throw new Error('Argomento mancante dopo --state-dir')
      stateDir = resolve(next)
      continue
    }
    if (arg === '--node') {
      const next = argv[++i]
      if (!next) throw new Error('Argomento mancante dopo --node')
      rawNode = next
      continue
    }
    if (arg === '--participants') {
      const next = argv[++i]
      if (!next) throw new Error('Argomento mancante dopo --participants')
      participantOverrides = JSON.parse(readFileSync(resolve(next), 'utf8')) as ParticipantAddressOverrides
      continue
    }
    throw new Error(`Opzione sconosciuta: ${arg}`)
  }

  if (rawNode === 'xrpl-labs') rawNode = 'xrplLabs'
  if (rawNode !== 'ripple' && rawNode !== 'xrplLabs') {
    throw new Error('Nodo Testnet non valido: usare ripple oppure xrplLabs')
  }

  return { help: false, stateDir, node: rawNode, participantOverrides }
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
    process.stderr.write(`Configurazione pubblica salvata in: ${publicConfigPath}\n`)
    process.stdout.write(`${JSON.stringify(publicOutput, null, 2)}\n`)
  } finally {
    attempts.close()
    await client.disconnect()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Errore imprevisto durante setup-wallets'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
