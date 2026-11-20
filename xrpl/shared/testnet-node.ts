export type TestnetNode = 'ripple' | 'xrplLabs'

/** Accetta sia `xrplLabs` (setup wallet) sia `xrpl-labs` (CLI affitti). */
export function normalizeTestnetNode(value: string | undefined): TestnetNode {
  const raw = value ?? 'ripple'
  if (raw === 'ripple') return 'ripple'
  if (raw === 'xrplLabs' || raw === 'xrpl-labs') return 'xrplLabs'
  throw new Error('Nodo Testnet non valido: usare ripple, xrplLabs oppure xrpl-labs')
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
