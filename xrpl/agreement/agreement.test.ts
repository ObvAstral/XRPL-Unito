import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assembleAgreement, prepareAgreement, signAgreement, toRippleTime, verifyAgreement, verifyAgreementSignature,
  type Agreement, type AgreementSignature, type AgreementTrust,
} from './agreement.js'
import { canonicalJson, decodeUtf8, parseExactJson } from './json.js'

const fixture = (name: string) => fileURLToPath(new URL(`../../agreement/fixtures/order-1/${name}`, import.meta.url))
const readFixture = (name: string) => parseExactJson(readFileSync(fixture(name)))
const order = readFixture('order.json') as Agreement
const trust = readFixture('trusted.json') as AgreementTrust
const aliceSignature = readFixture('alice-signature.json') as AgreementSignature
const bobSignature = readFixture('bob-signature.json') as AgreementSignature
const regulation = decodeUtf8(readFileSync(fixture('regulation.txt')))
const bundle = assembleAgreement(order, regulation, aliceSignature, bobSignature, trust)

test('T13 verifica offline il fascicolo demo-order-1 con due firme', () => {
  assert.deepEqual(verifyAgreement(bundle, trust), bundle)
  assert.equal(bundle.agreementHash, '146edb0536d87969343cd91e702300db3832286cd13e5ad513b08319f827ba80')
  assert.deepEqual(assembleAgreement(order, regulation, bobSignature, aliceSignature, trust), bundle)
  assert.deepEqual(verifyAgreementSignature(order, regulation, aliceSignature, trust), aliceSignature)
  assert.equal(toRippleTime(order.deadlines.cancelAfter) - toRippleTime(order.deadlines.finishAfter), 300)
})

test('T13 rifiuta una firma mancante, un duplicato di Alice e una chiave estranea', () => {
  assert.throws(() => verifyAgreement({ ...bundle, signatures: { alice: bundle.signatures.alice } }, trust), /signatures/)
  assert.throws(() => verifyAgreement({
    ...bundle, signatures: { alice: bundle.signatures.alice, bob: bundle.signatures.alice },
  }, trust), /Firma bob non valida/)
  assert.throws(() => assembleAgreement(order, regulation, aliceSignature, aliceSignature, trust), /una firma di Alice e una di Bob/)

  const stranger = generateKeyPairSync('ed25519')
  const strangerTrust = structuredClone(trust)
  strangerTrust.parties.bob.publicKeyPem = stranger.publicKey.export({ format: 'pem', type: 'spki' }).toString()
  const forged = signAgreement(order, regulation, strangerTrust, 'bob', stranger.privateKey)
  assert.throws(() => assembleAgreement(order, regulation, aliceSignature, forged, trust), /Firma bob non valida/)
  assert.throws(() => verifyAgreement(bundle, strangerTrust), /Firma bob non valida/)
  assert.throws(() => signAgreement(order, regulation, trust, 'bob', stranger.privateKey), /Chiave privata Ed25519 inattesa/)

  const duplicateKey = structuredClone(trust)
  duplicateKey.parties.bob.publicKeyPem = duplicateKey.parties.alice.publicKeyPem
  assert.throws(() => verifyAgreement(bundle, duplicateKey), /chiavi applicative distinte/)
})

test('T14 lega firme e hash a oracolo, ordine, condizione e scadenze', () => {
  const changedOracle = structuredClone(order)
  changedOracle.parties.oracle.address = 'rG5Ro9e3uGEZVCh3zu5gB9ydKUskCs221W'
  const otherOracleTrust = structuredClone(trust)
  otherOracleTrust.parties.oracle.address = changedOracle.parties.oracle.address
  const changedOrder = { ...order, orderId: 'order-2' }
  const changedCondition = { ...order, condition: `A0258020${'ab'.repeat(32)}810120` }
  const changedDeadline = { ...order, deadlines: { ...order.deadlines, fundBy: '2026-11-20T15:31:31Z' } }

  assert.throws(() => verifyAgreement({ ...bundle, agreement: changedOracle }, trust), /oracle.address/)
  assert.throws(() => verifyAgreement({ ...bundle, agreement: changedOrder }, trust), /ordine inatteso/)
  for (const [agreement, config] of [
    [changedOracle, otherOracleTrust],
    [changedOrder, { ...trust, orderId: 'order-2' }],
    [changedCondition, trust],
    [changedDeadline, trust],
  ] as const) {
    assert.throws(() => verifyAgreement({ ...bundle, agreement }, config), /agreementHash/)
    const updated = prepareAgreement(agreement, regulation, config)
    assert.throws(() => verifyAgreement({ ...bundle, ...updated }, config), /Firma alice non valida/)
  }
})

test('T14 verifica i byte e la versione del regolamento contro la config fidata', () => {
  const altered = regulation.replace('zero XRP', 'Zero XRP')
  assert.throws(() => verifyAgreement({ ...bundle, regulationText: altered }, trust), /regolamento/)
  assert.throws(() => verifyAgreement({ ...bundle, regulationText: regulation.replaceAll('\n', '\r\n') }, trust), /regolamento/)
  assert.throws(() => verifyAgreement({ ...bundle, regulationText: `\uFEFF${regulation}` }, trust), /regolamento/)
  const alteredAgreement = {
    ...order, regulation: { version: 1, sha256: createHash('sha256').update(altered, 'utf8').digest('hex') },
  }
  assert.throws(() => prepareAgreement(alteredAgreement, altered, trust), /regolamento/)
  assert.throws(() => prepareAgreement({ ...order, regulation: { ...order.regulation, version: 2 } }, regulation, trust), /regolamento/)
})

test('JCS ordina anche proprietà annidate e firma UTF-8 senza normalizzazione', () => {
  const unordered = { zz: 'é🚀', obj: { '\uE000': 'ult', a: 'primo', '🚀': 'medio' } }
  assert.equal(canonicalJson(unordered), '{"obj":{"a":"primo","🚀":"medio","":"ult"},"zz":"é🚀"}')
  const reversed = Object.fromEntries(Object.entries(order).reverse())
  reversed.parties = { oracle: order.parties.oracle, bob: order.parties.bob, alice: order.parties.alice }
  assert.equal(prepareAgreement(reversed, regulation, trust).agreementHash, bundle.agreementHash)

  const unicodeOrder = { ...order, input: { ...order.input, id: 'caffè 🚀' } }
  const unicodeText = '\uFEFFRegolamento – già approvato.\r\n'
  const unicodeBytes = Buffer.from(unicodeText, 'utf8')
  const regulationPin = { version: 1, sha256: createHash('sha256').update(unicodeBytes).digest('hex') }
  unicodeOrder.regulation = regulationPin
  const alice = generateKeyPairSync('ed25519')
  const config = structuredClone(trust)
  config.parties.alice.publicKeyPem = alice.publicKey.export({ format: 'pem', type: 'spki' }).toString()
  config.regulation = regulationPin
  const decoded = decodeUtf8(unicodeBytes)
  assert.equal(decoded, unicodeText)
  const detached = signAgreement(unicodeOrder, decoded, config, 'alice', alice.privateKey)
  const canonical = Buffer.from(canonicalJson(unicodeOrder), 'utf8')
  const signature = Buffer.from(detached.signature, 'base64')
  assert(verify(null, canonical, alice.publicKey, signature))
  assert.equal(verify(null, Buffer.from(detached.agreementHash, 'hex'), alice.publicKey, signature), false)
  const decomposed = { ...unicodeOrder, input: { ...unicodeOrder.input, id: unicodeOrder.input.id.normalize('NFD') } }
  assert.notEqual(prepareAgreement(decomposed, unicodeText, config).agreementHash, detached.agreementHash)
})

test('rifiuta input ambiguo o fuori schema', () => {
  assert.throws(() => parseExactJson(Buffer.from('{"outer":{"id":1,"\\u0069d":2}}')), /duplicata/)
  assert.deepEqual(parseExactJson(Buffer.from('{"a":{"id":1},"b":{"id":2,"x":"{:\\"}"}}')), {
    a: { id: 1 }, b: { id: 2, x: '{:"}' },
  })
  assert.throws(() => decodeUtf8(Uint8Array.of(0xed, 0xa0, 0x80)), /utf-8/i)
  assert.throws(() => prepareAgreement({ ...order, input: { ...order.input, id: '\ud800' } }, regulation, trust), /Unicode/)
  assert.throws(() => prepareAgreement({ ...order, unsignedTerms: 'diversi' }, regulation, trust), /proprietà attese/)
  assert.throws(() => prepareAgreement({ ...order, network: 'mainnet' }, regulation, trust), /rete/)
  assert.throws(() => prepareAgreement({ ...order, priceDrops: '1000000' }, regulation, trust), /priceDrops/)
  assert.throws(() => prepareAgreement({ ...order, condition: 'ff'.repeat(32) }, regulation, trust), /condition/)
  assert.throws(() => prepareAgreement({ ...order, offerId: `${order.offerId}\n` }, regulation, trust), /offerId/)
  const invalidWallet = structuredClone(order)
  invalidWallet.parties.alice.address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTa'
  assert.throws(() => prepareAgreement(invalidWallet, regulation, trust), /checksum/)
  assert.throws(() => toRippleTime('2026-11-20T15:31:31.001Z'), /ISO al secondo/)
  assert.throws(() => toRippleTime('2026-02-30T15:31:31Z'), /ISO al secondo/)
  assert.throws(() => toRippleTime('2026-11-20T16:31:31+01:00'), /ISO al secondo/)
  assert.throws(() => verifyAgreement({
    ...bundle, signatures: { ...bundle.signatures, bob: bundle.signatures.bob.replace(/==$/, '') },
  }, trust), /formato non valido/)
})

test('CLI locale firma dopo conferma ed esporta e verifica il fascicolo', (context) => {
  const temp = mkdtempSync(join(tmpdir(), 'xrpl-agreement-test-'))
  context.after(() => rmSync(temp, { recursive: true, force: true }))
  const cli = fileURLToPath(new URL('./cli.js', import.meta.url))
  const run = (args: string[], input = '') => {
    const stdin = join(temp, 'stdin')
    const stdout = join(temp, 'stdout')
    const stderr = join(temp, 'stderr')
    writeFileSync(stdin, input)
    // I descrittori su file funzionano anche in sandbox che bloccano socketpair.
    const stdio = [openSync(stdin, 'r'), openSync(stdout, 'w'), openSync(stderr, 'w')]
    try {
      const result = spawnSync(process.execPath, [cli, ...args], { stdio, timeout: 5000 })
      assert.ifError(result.error)
      return { status: result.status, stdout: readFileSync(stdout, 'utf8'), stderr: readFileSync(stderr, 'utf8') }
    } finally {
      for (const fd of stdio) closeSync(fd)
    }
  }
  const assembled = run(['assemble', fixture('order.json'), fixture('regulation.txt'), fixture('trusted.json'),
    fixture('alice-signature.json'), fixture('bob-signature.json')])
  assert.equal(assembled.status, 0, assembled.stderr)
  assert.deepEqual(JSON.parse(assembled.stdout), bundle)
  const bundlePath = join(temp, 'bundle.json')
  writeFileSync(bundlePath, assembled.stdout)
  const verified = run(['verify', bundlePath, fixture('trusted.json')])
  assert.equal(verified.status, 0, verified.stderr)
  assert.deepEqual(JSON.parse(verified.stdout), { orderId: 'demo-order-1', agreementHash: bundle.agreementHash })

  const alice = generateKeyPairSync('ed25519')
  const config = structuredClone(trust)
  config.parties.alice.publicKeyPem = alice.publicKey.export({ format: 'pem', type: 'spki' }).toString()
  const keyPath = join(temp, 'alice.pem')
  const configPath = join(temp, 'trusted.json')
  writeFileSync(keyPath, alice.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  writeFileSync(configPath, JSON.stringify(config))
  const args = ['sign', fixture('order.json'), fixture('regulation.txt'), configPath, 'alice', keyPath]
  const declined = run(args)
  assert.equal(declined.status, 1, declined.stderr)
  assert.match(declined.stderr, /Firma annullata/)
  assert.equal(declined.stdout, '')
  const signed = run(args, 'FIRMA\n')
  assert.equal(signed.status, 0, signed.stderr)
  assert.match(signed.stderr, /Regolamento verificato/)
  assert.match(signed.stderr, /Bob può ritirare il PNG/)
  const detached = verifyAgreementSignature(order, regulation, JSON.parse(signed.stdout), config)
  assert.equal(detached.role, 'alice')
  assert(verify(null, Buffer.from(canonicalJson(order)), createPublicKey(alice.privateKey), Buffer.from(detached.signature, 'base64')))
})
