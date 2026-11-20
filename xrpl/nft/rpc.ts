import { record } from './pass.js'
import type { LedgerRequest } from './pass.js'

const urls = new Map([
  ['ripple', 'https://s.altnet.rippletest.net:51234/'],
  ['xrpl-labs', 'https://testnet.xrpl-labs.com/'],
])

export class RpcError extends Error {
  code: string
  searchedAll: boolean

  constructor(code: string, searchedAll = false) {
    super(`Errore XRPL: ${code}`)
    this.code = code
    this.searchedAll = searchedAll
  }
}

export async function connectTestnet(nodeName = 'ripple'): Promise<LedgerRequest> {
  const url = urls.get(nodeName)
  if (!url) throw new Error('XRPL_TESTNET_NODE deve essere ripple o xrpl-labs.')
  const rpc: LedgerRequest = async (method, fields = {}) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params: [{ ...fields, api_version: 2 }] }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`RPC Testnet ha risposto HTTP ${response.status}.`)
    const data = record(await response.json())
    const result = data.result === undefined ? data : record(data.result)
    if (typeof result.error === 'string') throw new RpcError(result.error, result.searched_all === true)
    if (result.status !== 'success') throw new Error('Risposta RPC Testnet non valida.')
    return result
  }

  const info = record((await rpc('server_info')).info)
  if (info.network_id !== undefined && info.network_id !== 1) {
    throw new Error('Il nodo configurato non appartiene alla XRPL Testnet.')
  }
  return rpc
}
