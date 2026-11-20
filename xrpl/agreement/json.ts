export function decodeUtf8(bytes: Uint8Array): string {
  // Preserva anche un eventuale BOM nei byte del regolamento.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

export function parseExactJson(bytes: Uint8Array): unknown {
  const text = decodeUtf8(bytes)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON non valido')
  }

  // JSON.parse scarta i nomi duplicati. Sul testo già validato, un ':' segue
  // sempre un nome di proprietà. Confrontiamo i nomi dopo il decoding JSON.
  const objects: Set<string>[] = []
  let previous = ''
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}:]/g)) {
    if (token === '{') objects.push(new Set())
    if (token === '}') objects.pop()
    if (token === ':') {
      const name: string = JSON.parse(previous)
      const names = objects.at(-1)!
      if (names.has(name)) throw new Error('Proprietà JSON duplicata')
      names.add(name)
    }
    previous = token
  }
  return value
}

type AgreementJson = string | number | { [key: string]: AgreementJson }

// Il chiamante fornisce solo i valori dello schema validato: oggetti, interi
// sicuri e stringhe Unicode valide. sort() ordina per code unit UTF-16 (JCS).
export function canonicalJson(value: AgreementJson): string {
  if (typeof value !== 'object') return JSON.stringify(value)
  const members = Object.entries(value)
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
  return `{${members.join(',')}}`
}
