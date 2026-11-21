import { normalizeTestnetNode, testnetHttpUrl } from '../shared/testnet-node.js'
import { record } from './pass.js'
import type { LedgerRequest } from './pass.js'

export class RpcError extends Error {
  code: string
  searchedAll: boolean

  constructor(code: string, searchedAll = false) {
    super(`XRPL error: ${code}`)
    this.code = code
    this.searchedAll = searchedAll
  }
}

export async function connectTestnet(nodeName?: string): Promise<LedgerRequest> {
  const url = testnetHttpUrl(normalizeTestnetNode(nodeName))
  const rpc: LedgerRequest = async (method, fields = {}) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params: [{ ...fields, api_version: 2 }] }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`Testnet RPC responded HTTP ${response.status}.`)
    const data = record(await response.json())
    const result = data.result === undefined ? data : record(data.result)
    if (typeof result.error === 'string') throw new RpcError(result.error, result.searched_all === true)
    if (result.status !== 'success') throw new Error('Invalid Testnet RPC response.')
    return result
  }

  const info = record((await rpc('server_info')).info)
  if (info.network_id !== undefined && info.network_id !== 1) {
    throw new Error('Configured node does not belong to XRPL Testnet.')
  }
  return rpc
}
