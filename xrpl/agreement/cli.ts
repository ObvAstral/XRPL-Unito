import { createPrivateKey } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { assembleAgreement, prepareAgreement, signAgreement, verifyAgreement } from './agreement.js'
import { decodeUtf8, parseExactJson } from './json.js'

const help = `Dopo npm --prefix xrpl run build
  node xrpl/dist/agreement/cli.js sign <ordine.json> <regolamento.txt> <config.json> <alice|bob> <chiave.pem>
  node xrpl/dist/agreement/cli.js assemble <ordine.json> <regolamento.txt> <config.json> <firma1.json> <firma2.json>
  node xrpl/dist/agreement/cli.js verify <fascicolo.json> <config.json>

sign mostra i termini e il regolamento su stderr, richiede la conferma FIRMA
e scrive la firma distaccata in JSON su stdout. Usare una chiave applicativa
Ed25519 privata PEM PKCS#8 locale e protetta. Tenere i file privati fuori dal repo.
assemble verifica entrambe le firme e scrive il fascicolo in JSON su stdout.
verify verifica offline e scrive orderId e agreementHash su stdout.
Usare la redirezione di stdout per salvare i JSON. Gli errori vanno su stderr.

La config fidata va fornita separatamente dal fascicolo. Contiene orderId,
network (testnet), parties con address e publicKeyPem (SPKI Ed25519) per
alice e bob, address per oracle e regulation con version e sha256 attesi.
Nell'accordo i ruoli sono le chiavi di parties. condition è la Condition
pubblica XRPL per una preimage da 32 byte. Le scadenze sono ISO UTC al
secondo, i digest sono SHA-256 esadecimali minuscoli e il prezzo è in drops.
La verifica offline controlla le firme anche a scadenza trascorsa.

Dal draft NFT all'accordo firmato
  orderId, nftId, offerId    -> agreement.orderId, agreement.nftId, agreement.offerId
  aliceAddress, bobAddress  -> agreement.parties.alice.address, agreement.parties.bob.address
  offerExpiresAt            -> agreement.deadlines.offerExpiresAt (stesso valore ISO UTC)

Usare nftId e offerId validati. Dopo l'accettazione, completare l'accordo
con parties.oracle.address e condition dell'oracolo, fundBy, startBy,
deliverBy, finishAfter e cancelAfter sotto deadlines e gli altri termini
dell'ordine. finishAfter coincide con deliverBy. Chiavi applicative e pin
del regolamento si leggono dalla config fidata.
Vedere fixtures/order-1 per demo-order-1 con firme già pronte.
`

async function readJson(path: string): Promise<unknown> {
  return parseExactJson(await readFile(path))
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function confirmSignature(): Promise<boolean> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
  try {
    for await (const line of lines) return line === 'FIRMA'
    return false
  } finally {
    lines.close()
  }
}

function displayText(text: string): string {
  // Visualizza CRLF come a capo ed evita controlli del terminale nel testo.
  return text.replace(/\r\n/g, '\n').replace(/[\p{Cc}\p{Bidi_Control}]/gu, (character) => {
    if (character === '\n' || character === '\t') return character
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

async function main(args: string[]) {
  const [command, ...parameters] = args
  if ((!command || command === '--help' || command === '-h') && parameters.length === 0) {
    process.stdout.write(help)
    return
  }

  if (command === 'verify' && parameters.length === 2) {
    const [bundlePath, configPath] = parameters
    if (!bundlePath || !configPath) throw new Error('Servono fascicolo e config fidata.')
    const bundle = verifyAgreement(await readJson(bundlePath), await readJson(configPath))
    printJson({ orderId: bundle.agreement.orderId, agreementHash: bundle.agreementHash })
    return
  }

  if ((command === 'sign' || command === 'assemble') && parameters.length === 5) {
    const [orderPath, regulationPath, configPath, first, second] = parameters
    if (!orderPath || !regulationPath || !configPath || !first || !second) throw new Error('Argomenti mancanti.')
    const order = await readJson(orderPath)
    const regulation = decodeUtf8(await readFile(regulationPath))
    const config = await readJson(configPath)
    if (command === 'assemble') {
      printJson(assembleAgreement(order, regulation, await readJson(first), await readJson(second), config))
      return
    }

    const role = first
    if (role !== 'alice' && role !== 'bob') throw new Error('Ruolo di firma richiesto: alice o bob')
    const prepared = prepareAgreement(order, regulation, config)
    process.stderr.write(`Firma come ${role}\n${JSON.stringify(prepared.agreement, null, 2)}\n`)
    process.stderr.write(`\nRegolamento verificato\n${displayText(prepared.regulationText)}\n`)
    process.stderr.write(`\nagreementHash ${prepared.agreementHash}\nScrivi FIRMA per confermare.\n`)
    if (!await confirmSignature()) throw new Error('Firma annullata')
    const keyFile = await open(second, 'r')
    try {
      const permissions = await keyFile.stat()
      if (!permissions.isFile() || (permissions.mode & 0o077) !== 0) {
        throw new Error('Il file PEM deve essere privato (0600).')
      }
      const privateKey = createPrivateKey(await keyFile.readFile())
      printJson(signAgreement(prepared.agreement, prepared.regulationText, config, role, privateKey))
    } finally {
      await keyFile.close()
    }
    return
  }

  throw new Error('Argomenti non validi. Vedi --help.')
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Errore durante l’operazione')
  process.exitCode = 1
}
