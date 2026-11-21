export type TestnetNode = 'ripple' | 'xrplLabs'

/** Accepts both `xrplLabs` (wallet setup) and `xrpl-labs` (rental CLI). */
export function normalizeTestnetNode(value: string | undefined): TestnetNode {
  const raw = value ?? 'ripple'
  if (raw === 'ripple') return 'ripple'
  if (raw === 'xrplLabs' || raw === 'xrpl-labs') return 'xrplLabs'
  throw new Error('Invalid Testnet node: use ripple, xrplLabs, or xrpl-labs')
}

export function testnetHttpUrl(node: TestnetNode): string {
  return node === 'ripple'
    ? 'https://s.altnet.rippletest.net:51234/'
    : 'https://testnet.xrpl-labs.com/'
}

export function testnetWsUrl(node: TestnetNode): string {
  return node === 'ripple'
    ? 'wss://s.altnet.rippletest.net:51233'
    : 'wss://testnet.xrpl-labs.com'
}

export const TESTNET_TX_EXPLORER_BASE_URL = 'https://testnet.xrpl.org/transactions'

export function testnetTxExplorerUrl(txHash: string): string {
  return `${TESTNET_TX_EXPLORER_BASE_URL}/${txHash.trim().toUpperCase()}`
}

const loggedTxHashes = new Set<string>()

export function logValidatedTestnetTx(info: {
  readonly label: string
  readonly txHash: string
  readonly ledgerIndex?: number | null
  readonly orderId?: string
}): void {
  const cleanHash = info.txHash.trim().toUpperCase()
  if (!cleanHash || loggedTxHashes.has(cleanHash)) return
  loggedTxHashes.add(cleanHash)
  const url = testnetTxExplorerUrl(cleanHash)
  const orderPart = info.orderId ? ` [${info.orderId}]` : ''
  const ledgerPart = info.ledgerIndex != null ? ` (ledger #${info.ledgerIndex})` : ''
  const argv1 = process.argv[1] ?? ''
  const useStderr =
    argv1.endsWith('rental-cli.js') ||
    argv1.endsWith('rental-cli.ts') ||
    argv1.endsWith('setup-wallets.js') ||
    argv1.endsWith('setup-wallets.ts')
  const stream = useStderr ? process.stderr : process.stdout
  stream.write(
    `[XRPL Testnet TX]${orderPart} ${info.label}${ledgerPart}: ${cleanHash}\n` +
      `  -> Verify on XRPL Testnet: ${url}\n`,
  )
}

