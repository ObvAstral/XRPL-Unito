export function decodeUtf8(bytes: Uint8Array): string {
  // Preserve any BOM bytes if present in the input payload.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

export function parseExactJson(bytes: Uint8Array): unknown {
  const text = decodeUtf8(bytes)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON')
  }

  // JSON.parse discards duplicate keys. On validated JSON text, a ':' always
  // follows a property name. Track property names per object scope.
  const objects: Set<string>[] = []
  let previous = ''
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}:]/g)) {
    if (token === '{') objects.push(new Set())
    if (token === '}') objects.pop()
    if (token === ':') {
      const name: string = JSON.parse(previous)
      const names = objects.at(-1)!
      if (names.has(name)) throw new Error('Duplicate JSON property')
      names.add(name)
    }
    previous = token
  }
  return value
}

type AgreementJson = string | number | { [key: string]: AgreementJson }

// Caller supplies only validated schema values: objects, safe integers,
// and valid Unicode strings. sort() orders by UTF-16 code unit (JCS).
export function canonicalJson(value: AgreementJson): string {
  if (typeof value !== 'object') return JSON.stringify(value)
  const members = Object.entries(value)
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
  return `{${members.join(',')}}`
}
