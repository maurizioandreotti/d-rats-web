import { computeCrc } from './crc'
import { yencode, ydecode } from './yencode'
import type { DDT2Frame } from '../types'

export const ENCODED_HEADER = new Uint8Array([0x5b, 0x53, 0x4f, 0x42, 0x5d])
export const ENCODED_TRAILER = new Uint8Array([0x5b, 0x45, 0x4f, 0x42, 0x5d])

export const MAGIC_COMPRESSED = 0xdd
export const MAGIC_UNCOMPRESSED = 0x22
export const HEADER_SIZE = 25

export const SESSION_CONTROL = 0
export const SESSION_CHAT = 1

function padCallsign(call: string): Uint8Array {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(call.padEnd(8, '~'))
  return bytes.slice(0, 8)
}

function trimCallsign(bytes: Uint8Array<ArrayBuffer>): string {
  const decoder = new TextDecoder()
  return decoder.decode(bytes).replace(/~/g, '')
}

export async function encodeFrame(
  frame: DDT2Frame,
  compress = true,
): Promise<Uint8Array> {
  const magic = compress ? MAGIC_COMPRESSED : MAGIC_UNCOMPRESSED

  let data: Uint8Array = frame.data
  if (compress) {
    const cs = new CompressionStream('deflate')
    const writer = cs.writable.getWriter()
    writer.write(data as Uint8Array<ArrayBuffer>)
    writer.close()
    const reader = cs.readable.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value!)
    }
    const totalLen = chunks.reduce((a, c) => a + c.length, 0)
    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    data = combined
  }

  const sStation = padCallsign(frame.header.sourceStation)
  const dStation = padCallsign(frame.header.destStation)

  const headerBase = new Uint8Array(HEADER_SIZE)
  const dv = new DataView(headerBase.buffer)
  dv.setUint8(0, magic)
  dv.setUint16(1, frame.header.seq, false)
  dv.setUint8(3, frame.header.sessionId)
  dv.setUint8(4, frame.header.type)
  dv.setUint16(5, 0, false)
  dv.setUint16(7, data.length, false)
  headerBase.set(sStation, 9)
  headerBase.set(dStation, 17)

  const crcInput = concat(headerBase, data)
  const checksum = computeCrc(crcInput)

  dv.setUint16(5, checksum, false)

  const raw = concat(headerBase, data)

  const encoded = yencode(raw)
  const result = new Uint8Array(ENCODED_HEADER.length + encoded.length + ENCODED_TRAILER.length)
  result.set(ENCODED_HEADER, 0)
  result.set(encoded, ENCODED_HEADER.length)
  result.set(ENCODED_TRAILER, ENCODED_HEADER.length + encoded.length)
  return result
}

export async function decodeFrame(wireData: Uint8Array): Promise<DDT2Frame | null> {
  const sobIndex = findSequence(wireData, ENCODED_HEADER)
  if (sobIndex === -1) return null

  const eobIndex = findSequence(wireData, ENCODED_TRAILER, sobIndex + ENCODED_HEADER.length)
  if (eobIndex === -1) return null

  const payloadStart = sobIndex + ENCODED_HEADER.length
  const encodedPayload = wireData.slice(payloadStart, eobIndex)
  const decoded = ydecode(encodedPayload)

  if (decoded.length < HEADER_SIZE) return null

  const dv = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength)
  const magic = dv.getUint8(0)

  let compressed = true
  if (magic === MAGIC_COMPRESSED) {
    compressed = true
  } else if (magic === MAGIC_UNCOMPRESSED) {
    compressed = false
  } else {
    return null
  }

  const seq = dv.getUint16(1, false)
  const sessionId = dv.getUint8(3)
  const type = dv.getUint8(4)
  const checksum = dv.getUint16(5, false)
  const length = dv.getUint16(7, false)
  const sStationRaw = decoded.slice(9, 17)
  const dStationRaw = decoded.slice(17, 25)
  const payload = decoded.slice(HEADER_SIZE, HEADER_SIZE + length)

  const sStation = trimCallsign(sStationRaw)
  const dStation = trimCallsign(dStationRaw)

  const headerForCrc = new Uint8Array(HEADER_SIZE)
  headerForCrc.set(decoded.slice(0, 5), 0)
  headerForCrc[5] = 0
  headerForCrc[6] = 0
  headerForCrc.set(decoded.slice(7, 25), 7)

  const crcInput = concat(headerForCrc, payload)
  const computedCrc = computeCrc(crcInput)
  if (computedCrc !== checksum) return null

  let data: Uint8Array
  if (compressed) {
    try {
      const cs = new DecompressionStream('deflate')
      const writer = cs.writable.getWriter()
      writer.write(payload as Uint8Array<ArrayBuffer>)
      writer.close()
      const reader = cs.readable.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(value!)
      }
      const totalLen = chunks.reduce((a, c) => a + c.length, 0)
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      data = combined
    } catch {
      return null
    }
  } else {
      data = new Uint8Array(payload) as Uint8Array<ArrayBuffer>
    }

    return {
      header: {
      magic,
      seq,
      sessionId,
      type,
      checksum,
      length,
      sourceStation: sStation,
      destStation: dStation,
    },
    data,
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
}

function findSequence(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  if (needle.length === 0) return start
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return -1
}
