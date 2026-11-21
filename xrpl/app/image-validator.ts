import { deflateSync, inflateSync } from 'node:zlib'

export interface DecodedImageInfo {
  readonly format: 'png' | 'jpeg'
  readonly mimeType: 'image/png' | 'image/jpeg'
  readonly width: number
  readonly height: number
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  )
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

function channelsForPngColorType(colorType: number): number | null {
  switch (colorType) {
    case 0:
      return 1
    case 2:
      return 3
    case 3:
      return 1
    case 4:
      return 2
    case 6:
      return 4
    default:
      return null
  }
}

function decodePng(bytes: Uint8Array): DecodedImageInfo {
  if (bytes.length < 33) {
    throw new Error('File PNG troppo corto o incompleto.')
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Firma PNG non valida.')
    }
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let sawIhdr = false
  let sawIend = false
  const idatChunks: Uint8Array[] = []

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error('Chunk PNG troncato.')
    }
    const length = readUint32BE(bytes, offset)
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    )
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`Chunk PNG ${type} oltre la fine del file.`)
    }
    const expectedCrc = readUint32BE(bytes, dataEnd)
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd))
    if (expectedCrc !== actualCrc) {
      throw new Error(`Checksum CRC32 non valido nel chunk PNG ${type}.`)
    }

    const data = bytes.subarray(dataStart, dataEnd)
    if (!sawIhdr) {
      if (type !== 'IHDR' || length !== 13) {
        throw new Error('Intestazione IHDR PNG mancante o non valida.')
      }
      width = readUint32BE(data, 0)
      height = readUint32BE(data, 4)
      bitDepth = data[8]!
      colorType = data[9]!
      const compression = data[10]!
      const filter = data[11]!
      interlace = data[12]!
      if (
        width < 1 ||
        height < 1 ||
        width > 16_384 ||
        height > 16_384 ||
        channelsForPngColorType(colorType) === null ||
        ![1, 2, 4, 8, 16].includes(bitDepth) ||
        compression !== 0 ||
        filter !== 0 ||
        (interlace !== 0 && interlace !== 1)
      ) {
        throw new Error('Parametri IHDR PNG non validi.')
      }
      sawIhdr = true
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      if (length !== 0) {
        throw new Error('Chunk IEND PNG non valido.')
      }
      sawIend = true
      offset = dataEnd + 4
      break
    }

    offset = dataEnd + 4
  }

  if (!sawIhdr || !sawIend || idatChunks.length === 0) {
    throw new Error('Struttura PNG incompleta (IHDR, IDAT o IEND mancanti).')
  }

  const totalIdatLength = idatChunks.reduce((acc, c) => acc + c.length, 0)
  const compressed = new Uint8Array(totalIdatLength)
  let pos = 0
  for (const chunk of idatChunks) {
    compressed.set(chunk, pos)
    pos += chunk.length
  }

  let inflated: Buffer
  try {
    inflated = inflateSync(compressed)
  } catch {
    throw new Error('Dati immagine PNG non decodificabili (stream zlib corrotto).')
  }

  const channels = channelsForPngColorType(colorType)!
  if (interlace === 0) {
    const bitsPerPixel = channels * bitDepth
    const rowBytes = Math.ceil((width * bitsPerPixel) / 8)
    const expectedLength = height * (1 + rowBytes)
    if (inflated.length !== expectedLength) {
      throw new Error('Dati pixel PNG non coerenti con le dimensioni dichiarate.')
    }
  } else if (inflated.length < height) {
    throw new Error('Dati pixel PNG interlacciati incompleti.')
  }

  return {
    format: 'png',
    mimeType: 'image/png',
    width,
    height,
  }
}

function decodeJpeg(bytes: Uint8Array): DecodedImageInfo {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('Firma JPEG non valida.')
  }

  let offset = 2
  let width = 0
  let height = 0
  let sawSof = false
  let sawSos = false
  let sawEoi = false

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error('Segmento JPEG non allineato al marcatore.')
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1
    }
    if (offset >= bytes.length) break
    const marker = bytes[offset]!
    offset += 1

    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue
    }
    if (marker === 0xd9) {
      sawEoi = true
      break
    }

    if (offset + 2 > bytes.length) {
      throw new Error('Lunghezza segmento JPEG troncata.')
    }
    const segLen = readUint16BE(bytes, offset)
    if (segLen < 2 || offset + segLen > bytes.length) {
      throw new Error('Lunghezza segmento JPEG non valida.')
    }

    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (segLen < 8) {
        throw new Error('Segmento SOF JPEG non valido.')
      }
      const precision = bytes[offset + 2]!
      height = readUint16BE(bytes, offset + 3)
      width = readUint16BE(bytes, offset + 5)
      const components = bytes[offset + 7]!
      if (
        (precision !== 8 && precision !== 12) ||
        width < 1 ||
        height < 1 ||
        width > 16_384 ||
        height > 16_384 ||
        ![1, 3, 4].includes(components)
      ) {
        throw new Error('Dimensioni o componenti SOF JPEG non validi.')
      }
      sawSof = true
    }

    offset += segLen

    if (marker === 0xda) {
      sawSos = true
      // Dopo SOS segue il flusso entropico fino al marcatore EOI (FF D9), saltando byte stuffing FF 00 e RSTn.
      let foundEoi = false
      while (offset < bytes.length - 1) {
        if (bytes[offset] === 0xff) {
          const next = bytes[offset + 1]!
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            offset += next === 0xff ? 1 : 2
            continue
          }
          if (next === 0xd9) {
            sawEoi = true
            foundEoi = true
            break
          }
          // Altri marcatori possibili nel flusso progressivo (es. DHT/SOS successivi).
          break
        }
        offset += 1
      }
      if (foundEoi) break
    }
  }

  if (!sawSof || !sawSos || !sawEoi || width < 1 || height < 1) {
    throw new Error('File JPEG incompleto o non decodificabile.')
  }

  return {
    format: 'jpeg',
    mimeType: 'image/jpeg',
    width,
    height,
  }
}

export function validateAndDecodeImage(bytes: Uint8Array): DecodedImageInfo {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('File immagine vuoto o assente.')
  }
  if (bytes.length > 10 * 1024 * 1024) {
    throw new Error('Immagine troppo grande (limite 10 MB).')
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return decodePng(bytes)
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return decodeJpeg(bytes)
  }
  throw new Error('Formato immagine non consentito: è richiesto un file PNG o JPEG valido.')
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length)
  writeUint32BE(chunk, 0, data.length)
  chunk[4] = type.charCodeAt(0)
  chunk[5] = type.charCodeAt(1)
  chunk[6] = type.charCodeAt(2)
  chunk[7] = type.charCodeAt(3)
  chunk.set(data, 8)
  const crc = crc32(chunk.subarray(4, 8 + data.length))
  writeUint32BE(chunk, 8 + data.length, crc)
  return chunk
}

export function createDemoBillboardPng(width = 160, height = 90): Buffer {
  const rowSize = 1 + width * 4
  const raw = new Uint8Array(height * rowSize)
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize
    raw[rowStart] = 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4
      const inBanner = y >= Math.floor(height * 0.25) && y <= Math.floor(height * 0.75) &&
        x >= Math.floor(width * 0.12) && x <= Math.floor(width * 0.88)
      if (inBanner) {
        raw[px] = 245
        raw[px + 1] = 158
        raw[px + 2] = 11
        raw[px + 3] = 255
      } else {
        raw[px] = 15
        raw[px + 1] = 76
        raw[px + 2] = 129
        raw[px + 3] = 255
      }
    }
  }

  const ihdr = new Uint8Array(13)
  writeUint32BE(ihdr, 0, width)
  writeUint32BE(ihdr, 4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)
  const chunks = [
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ]
  const total = chunks.reduce((acc, c) => acc + c.length, 0)
  const out = Buffer.allocUnsafe(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
