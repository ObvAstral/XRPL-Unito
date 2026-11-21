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
