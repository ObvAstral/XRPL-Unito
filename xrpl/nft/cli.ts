import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { isValidClassicAddress, Wallet } from 'xrpl'
import { acceptTransaction, checkOffer, checkOfferWindow, createPassVerifier, mintTransaction, offerTransaction,
  readHash, readUint32, recentSnapshot, record, rippleTime } from './pass.js'
import type { Fields, LedgerRequest, PassOrder, Snapshot } from './pass.js'
import { mintedNftId, createdOfferId } from './metadata.js'
import { connectTestnet } from './rpc.js'
import { AttemptJournal, runTransaction } from './transactions.js'

const usage = `Pass NFT IXH26 · XRPL Testnet
Dopo npm --prefix xrpl ci e npm --prefix xrpl run build:

  node xrpl/dist/nft/cli.js mint <mint.json> <alice.seed>
  node xrpl/dist/nft/cli.js offer <draft.json> <alice.seed>
  node xrpl/dist/nft/cli.js accept <draft.json> <bob.seed>
  node xrpl/dist/nft/cli.js verify-pass <draft.json> [ledgerHash]

mint.json: orderId univoco, aliceAddress, filter { id, version }, taxon (default 1).
draft.json: orderId, aliceAddress, bobAddress, nftId, offerExpiresAt (YYYY-MM-DDTHH:mm:ssZ).
Aggiungere l'offerId validato al draft prima di accept. verify-pass legge solo bobAddress e nftId.
Per un nuovo pass di inventario usare un orderId di mint diverso.
Per l'accordo, riportare gli stessi nftId e offerId, gli indirizzi in parties e la scadenza in deadlines.offerExpiresAt.
I risultati in JSON escono su stdout. I comandi di firma richiedono conferma nel terminale.

Usare un file seed Testnet separato per wallet, con permessi 0600, fuori dal repository.
XRPL_TESTNET_NODE seleziona ripple (default) o xrpl-labs.
IXH26_NFT_STATE_DIR seleziona la directory privata del registro locale (default ~/.local/state/ixh26-nft).
Al ritorno di pending, ripetere lo stesso comando e usare lo stesso registro per riconciliare l'hash.
`

function address(value: unknown): string {
  if (typeof value !== 'string' || !isValidClassicAddress(value)) {
    throw new Error('Indirizzo classico XRPL non valido.')
  }
  return value
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Campo obbligatorio: ${name}.`)
  return value
}

function print(result: Fields) {
  console.log(JSON.stringify(result, null, 2))
}

function readOrder(input: Fields): Omit<PassOrder, 'offerId'> {
  const aliceAddress = address(input.aliceAddress)
  const bobAddress = address(input.bobAddress)
  if (aliceAddress === bobAddress) throw new Error('Alice e Bob devono usare wallet distinti.')
  const offerExpiresAt = requiredString(input.offerExpiresAt, 'offerExpiresAt')
  rippleTime(offerExpiresAt)
  return {
    orderId: requiredString(input.orderId, 'orderId'), aliceAddress, bobAddress,
    nftId: readHash(input.nftId), offerExpiresAt,
  }
}

type SigningCommand = 'mint' | 'offer' | 'accept'

function prepareCommand(command: SigningCommand, input: Fields, rpc: LedgerRequest) {
  if (command === 'mint') {
    const filter = record(input.filter)
    const tx = mintTransaction(address(input.aliceAddress), readUint32(input.taxon ?? 1),
      requiredString(filter.id, 'filter.id'), readUint32(filter.version))
    return { tx }
  }
  const order = readOrder(input)
  if (command === 'offer') {
    return {
      tx: offerTransaction(order),
      preflight: async (snapshot: Snapshot) => { checkOfferWindow(order.offerExpiresAt, snapshot) },
    }
  }
  const fullOrder = { ...order, offerId: readHash(input.offerId) }
  return {
    tx: acceptTransaction(fullOrder), context: fullOrder,
    preflight: (snapshot: Snapshot) => checkOffer(rpc, fullOrder, snapshot),
  }
}

function walletFromFile(seedFile: string) {
  const file = statSync(seedFile)
  if (!file.isFile() || (file.mode & 0o077) !== 0) throw new Error('Il file seed deve essere privato (0600).')
  try {
    const seed = readFileSync(seedFile, 'utf8').trim()
    return Wallet.fromSeed(seed)
  } catch {
    throw new Error('Seed XRPL non valido.')
  }
}

function journalPath(): string {
  const directory = process.env.IXH26_NFT_STATE_DIR ?? join(homedir(), '.local', 'state', 'ixh26-nft')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const permissions = statSync(directory)
  if (!permissions.isDirectory() || (permissions.mode & 0o077) !== 0) {
    throw new Error('La directory del registro deve essere privata (0700).')
  }
  return join(directory, 'attempts.db')
}

async function sign(command: SigningCommand, input: Fields, seedFile: string, rpc: LedgerRequest) {
  const { tx, context, preflight } = prepareCommand(command, input, rpc)
  const signer = walletFromFile(seedFile)
  const orderId = requiredString(input.orderId, 'orderId')
  const journal = new AttemptJournal(journalPath())
  try {
    const outcome = await runTransaction({
      rpc, journal, signer, orderId, tx, context, preflight,
      confirm: async (fee) => {
        console.error(JSON.stringify({ network: 'testnet', orderId, ...tx, ...context, Fee: fee }, null, 2))
        const terminal = createInterface({ input: process.stdin, output: process.stderr })
        try {
          return (await terminal.question('Digita SI per firmare su Testnet: ')).trim() === 'SI'
        } finally {
          terminal.close()
        }
      },
    })
    if (outcome.status !== 'validated') {
      print(outcome)
      process.exitCode = outcome.status === 'pending' ? 2 : 1
      return
    }
    const { receipt, meta } = outcome
    try {
      if (command === 'accept') {
        print({ status: 'validated', nftId: readHash(input.nftId), offerId: readHash(input.offerId), ...receipt })
        return
      }
      const identify = tx.TransactionType === 'NFTokenCreateOffer'
        ? (fields: Fields) => createdOfferId(fields, tx)
        : mintedNftId
      let id: string
      try {
        id = identify(meta)
      } catch {
        const transaction = await rpc('tx', { transaction: receipt.txHash, binary: false })
        if (transaction.validated !== true || readHash(transaction.hash) !== receipt.txHash ||
          transaction.ledger_index !== receipt.ledgerIndex) {
          throw new Error('Impossibile riconciliare i metadati della transazione.')
        }
        const current = record(transaction.meta)
        if (current.TransactionResult !== 'tesSUCCESS') throw new Error('Metadati incoerenti.')
        id = identify(current)
      }
      print({ status: 'validated', [command === 'mint' ? 'nftId' : 'offerId']: id, ...receipt })
    } catch {
      print({ status: 'validated_id_unavailable', ...receipt })
      process.exitCode = 2
    }
  } finally {
    journal.close()
  }
}

async function main() {
  const [command, inputFile, last, ...rest] = process.argv.slice(2)
  if (!command || command === '--help') {
    console.log(usage)
    return
  }
  if (!inputFile || rest.length || !['mint', 'offer', 'accept', 'verify-pass'].includes(command)) {
    throw new Error(usage)
  }
  const input = record(JSON.parse(readFileSync(inputFile, 'utf8')))
  if (command === 'verify-pass') {
    const order = { bobAddress: address(input.bobAddress), nftId: readHash(input.nftId) }
    let ledgerHash = last ? readHash(last) : undefined
    try {
      const rpc = await connectTestnet(process.env.XRPL_TESTNET_NODE)
      ledgerHash ??= (await recentSnapshot(rpc)).hash
      const status = await createPassVerifier(rpc)(order, ledgerHash)
      print({ status, ledgerHash })
      process.exitCode = status === 'present' ? 0 : status === 'absent' ? 1 : 2
    } catch {
      print({ status: 'unavailable', ledgerHash })
      process.exitCode = 2
    }
    return
  }
  if (!last) throw new Error(usage)
  const rpc = await connectTestnet(process.env.XRPL_TESTNET_NODE)
  await sign(command as SigningCommand, input, last, rpc)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Errore inatteso.'
  console.error(message)
  process.exitCode = 1
})
