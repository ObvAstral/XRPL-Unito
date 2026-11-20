import { lstatSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import type { Transaction } from 'xrpl'
import { parseExactJson } from './json.js'
import { digestTerms, readOrder, readProposal, signOrder, signProposal, verifyRental } from './rental.js'
import type { RentalBundle, RentalResource, SignedProposal, TitleTerms } from './rental.js'
import { LocalSigner } from './wallet.js'
import { signLogin, WalletLogin, type LoginChallenge } from './wallet-login.js'
import { RentalNfts, verifyRentalPass, type OfferIds } from '../nft/rental.js'
import { connectTestnet } from '../nft/rpc.js'
import { AttemptJournal } from '../nft/transactions.js'
import { recentSnapshot } from '../nft/pass.js'

const commands = {
  'wallet-create': ['ruolo'],
  'wallet-address': ['ruolo'],
  'tx-sign': ['transazione.json', 'ruolo'],
  'tx-sign-partial': ['transazione.json', 'ruolo'],
  'login-issue': ['dominio', 'sessionRef'],
  'login-sign': ['dominio', 'challenge.json', 'ruolo'],
  'login-consume': ['dominio', 'sessionRef', 'risposta.json'],
  'proposal-sign': ['proposta.json', 'ruolo'],
  'order-sign': ['proposta-firmata.json', 'ordine.json', 'ruolo'],
  'rental-verify': ['accordo.json', 'risorsa.json'],
  'title-issue': ['titolo.json', 'ruolo'],
  'title-accept': ['titolo.json', 'offerta.json', 'ruolo'],
  'pass-issue': ['accordo.json', 'risorsa.json', 'ruolo'],
  'pass-accept': ['accordo.json', 'risorsa.json', 'offerta.json', 'ruolo'],
  'pass-verify': ['accordo.json', 'risorsa.json', 'nftId', 'ledgerHash'],
  'mint-offer-mode': [],
} as const

function json<T>(path: string): T {
  return parseExactJson(readFileSync(path)) as T
}

function privateDirectory(): string {
  const directory = process.env.XRPL_RENTAL_STATE_DIR ?? join(homedir(), '.local', 'state', 'xrpl-unito-rental')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const state = lstatSync(directory)
  if (!state.isDirectory() || (state.mode & 0o077) !== 0) throw new Error('Directory di stato privata (0700) richiesta.')
  return directory
}

function seed(role: string) {
  if (!['alice', 'bob', 'cad', 'comune'].includes(role)) throw new Error('Ruoli ammessi: alice, bob, cad, comune.')
  return join(privateDirectory(), role + '.seed')
}

async function confirm(request: object): Promise<boolean> {
  console.error(JSON.stringify(request, null, 2))
  const terminal = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return (await terminal.question('Digita SI per firmare: ')).trim() === 'SI'
  } finally {
    terminal.close()
  }
}

async function approve(request: object) {
  if (!await confirm(request)) throw new Error('Firma annullata.')
}

async function main(command: keyof typeof commands, args: string[]) {
  // main is called only after checking the argument count against the command.
  const [a, b, c, d] = args as [string, string, string, string]
  if (command === 'wallet-create') return { address: LocalSigner.create(seed(a)).classicAddress }
  if (command === 'wallet-address') return { address: LocalSigner.load(seed(a)).classicAddress }
  if (command === 'tx-sign' || command === 'tx-sign-partial') {
    const transaction = json<Transaction>(a)
    const signer = LocalSigner.load(seed(b))
    const partial = command === 'tx-sign-partial'
    await approve({ network: 'testnet', signer: signer.classicAddress, partial, transaction })
    return partial ? signer.signPartial(transaction) : signer.sign(transaction)
  }
  if (command === 'login-issue' || command === 'login-consume') {
    const login = new WalletLogin(join(privateDirectory(), 'login.sqlite'), a)
    try {
      if (command === 'login-issue') return login.issue(b)
      const { id, proof } = json<{ id: string; proof: unknown }>(c)
      return login.consume(id, b, proof)
    } finally {
      login.close()
    }
  }
  if (command === 'login-sign') {
    const challenge = json<LoginChallenge>(b)
    await approve({ action: 'Login', domain: a, challenge })
    return { id: challenge.id, proof: signLogin(challenge, a, LocalSigner.load(seed(c))) }
  }
  if (command === 'proposal-sign') {
    const proposal = readProposal(json(a))
    await approve(proposal)
    return { ...signProposal(proposal, LocalSigner.load(seed(b))), proposalHash: digestTerms(proposal) }
  }
  if (command === 'order-sign') {
    const signed = json<SignedProposal>(a)
    const order = readOrder(json(b))
    await approve({ proposal: readProposal(signed.proposal), order })
    return signOrder(signed, order, LocalSigner.load(seed(c)))
  }
  if (command === 'rental-verify') return verifyRental(json<RentalBundle>(a), json<RentalResource>(b))

  if (command === 'pass-verify') {
    const bundle = json<RentalBundle>(a)
    const resource = json<RentalResource>(b)
    const rpc = await connectTestnet(process.env.XRPL_TESTNET_NODE).catch(() => undefined)
    return { status: rpc ? await verifyRentalPass(rpc, bundle, resource, c, d) : 'unavailable' as const }
  }
  const rpc = await connectTestnet(process.env.XRPL_TESTNET_NODE)
  const journal = new AttemptJournal(join(privateDirectory(), 'nft-attempts.sqlite'))
  const nft = new RentalNfts(rpc, journal)
  const signing = (role: string) => ({
    signer: LocalSigner.load(seed(role)),
    confirm: (transaction: object, terms: object) => confirm({ network: 'testnet', transaction, terms }),
  })
  try {
    if (command === 'title-issue') return await nft.issueTitle(json<TitleTerms>(a), signing(b))
    if (command === 'title-accept') return await nft.acceptTitle(json<TitleTerms>(a), json<OfferIds>(b), signing(c))
    if (command === 'mint-offer-mode') {
      const { hash: ledgerHash } = await recentSnapshot(rpc)
      return { ledgerHash, combinedMintOffer: await nft.mintOfferEnabled(ledgerHash) }
    }
    const bundle = json<RentalBundle>(a)
    const resource = json<RentalResource>(b)
    if (command === 'pass-issue') return await nft.issuePass(bundle, resource, signing(c))
    return await nft.acceptPass(bundle, resource, json<OfferIds>(c), signing(d))
  } finally {
    journal.close()
  }
}

const [command, ...args] = process.argv.slice(2)
if (!command || !Object.hasOwn(commands, command) || args.length !== commands[command as keyof typeof commands].length) {
  console.error('Uso: node xrpl/dist/agreement/rental-cli.js <comando>\n' + Object.entries(commands)
    .map(([name, fields]) => [name, ...fields].join(' ')).join('\n'))
  process.exitCode = 1
} else {
  try {
    const result = await main(command as keyof typeof commands, args)
    console.log(JSON.stringify(result, null, 2))
    if ('status' in result && (result.status === 'pending' || result.status === 'unavailable')) process.exitCode = 2
    else if ('status' in result && (result.status === 'rejected' || result.status === 'absent')) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Operazione fallita.')
    process.exitCode = 1
  }
}
