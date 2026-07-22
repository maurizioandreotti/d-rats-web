import { describe, it, expect } from 'vitest'
import { computeCrc, verifyCrc } from './crc'
import { yencode, ydecode } from './yencode'
import {
  encodeFrame,
  decodeFrame,
  MAGIC_COMPRESSED,
  MAGIC_UNCOMPRESSED,
  SESSION_CHAT,
} from './ddt2'
import type { DDT2Frame } from '../types'

// === CRC Tests ===

describe('CRC-16', () => {
  it('matches Python calc_checksum for known data', () => {
    const data = new Uint8Array([
      0x22, 0x00, 0x01, 0x00, 0x00, 0x00, 0x0b, 0x00,
      0x4d, 0x59, 0x43, 0x41, 0x4c, 0x4c, 0x7e, 0x7e,
      0x43, 0x51, 0x43, 0x51, 0x43, 0x51, 0x7e, 0x7e,
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f,
      0x72, 0x6c, 0x64,
    ])
    expect(computeCrc(data)).toBe(0xcb38)
  })

  it('computes zero CRC for empty data', () => {
    expect(computeCrc(new Uint8Array([]))).toBe(0x0000)
  })

  it('matches Python calc_checksum for bare Hello World', () => {
    const data = new TextEncoder().encode('Hello World')
    expect(computeCrc(data)).toBe(0x992a)
  })

  it('verifyCrc matches computeCrc', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03])
    expect(computeCrc(data)).toBe(0x6131)
    expect(verifyCrc(data, 0x6131)).toBe(true)
    expect(verifyCrc(data, 0x6132)).toBe(false)
  })
})

// === yEncode Tests ===

describe('yEncode', () => {
  it('round-trips all byte values 0-255', () => {
    const allBytes = new Uint8Array(256).map((_, i) => i)
    const encoded = yencode(allBytes)
    const decoded = ydecode(encoded)
    expect(decoded).toEqual(allBytes)
  })

  it('escapes banned bytes and equals sign', () => {
    const bannedSample = new Uint8Array([0x11, 0x13, 0x00, 0x3d])
    const encoded = yencode(bannedSample)
    expect(encoded.length).toBeGreaterThan(bannedSample.length)
    const decoded = ydecode(encoded)
    expect(decoded).toEqual(bannedSample)
  })
})

// === DDT2 Encode/Decode Tests ===

function makeTestFrame(overrides: Partial<DDT2Frame['header']> = {}, data?: Uint8Array): DDT2Frame {
  return {
    header: {
      magic: MAGIC_UNCOMPRESSED,
      seq: 0,
      sessionId: SESSION_CHAT,
      type: 0,
      checksum: 0,
      length: 0,
      sourceStation: 'MYCALL',
      destStation: 'CQCQCQ',
      ...overrides,
    },
    data: data ?? new TextEncoder().encode('Hello World'),
  }
}

// Python-generated test vectors
const PYTHON_UNCOMPRESSED = new Uint8Array([
  0x5b, 0x53, 0x4f, 0x42, 0x5d,
  0x22, 0x3d, 0x40, 0x3d, 0x40, 0x01, 0x3d, 0x40, 0xa7, 0x98, 0x3d, 0x40, 0x0b,
  0x4d, 0x59, 0x43, 0x41, 0x4c, 0x4c, 0x7e, 0x7e, 0x43, 0x51, 0x43, 0x51, 0x43,
  0x51, 0x7e, 0x7e, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c,
  0x64,
  0x5b, 0x45, 0x4f, 0x42, 0x5d,
])

const PYTHON_COMPRESSED = new Uint8Array([
  0x5b, 0x53, 0x4f, 0x42, 0x5d,
  0xdd, 0x3d, 0x40, 0x3d, 0x40, 0x01, 0x3d, 0x40, 0x1b, 0x3d, 0x51, 0x3d, 0x40,
  0x3d, 0x53, 0x4d, 0x59, 0x43, 0x41, 0x4c, 0x4c, 0x7e, 0x7e, 0x43, 0x51, 0x43,
  0x51, 0x43, 0x51, 0x7e, 0x7e, 0x78, 0xda, 0xf3, 0x48, 0xcd, 0xc9, 0xc9, 0x57,
  0x08, 0xcf, 0x2f, 0xca, 0x49, 0x01, 0x3d, 0x40, 0x18, 0x0b, 0x04, 0x1d,
  0x5b, 0x45, 0x4f, 0x42, 0x5d,
])

describe('DDT2 round-trip', () => {
  it('encodes then decodes an uncompressed frame', async () => {
    const original = makeTestFrame({ magic: MAGIC_UNCOMPRESSED }, new TextEncoder().encode('Hello World'))
    const wireData = await encodeFrame(original, false)
    expect(wireData[0]).toBe(0x5b)
    expect(wireData[wireData.length - 1]).toBe(0x5d)

    const decoded = await decodeFrame(wireData)
    expect(decoded).not.toBeNull()
    expect(decoded!.header.sourceStation).toBe('MYCALL')
    expect(decoded!.header.destStation).toBe('CQCQCQ')
    expect(decoded!.header.seq).toBe(0)
    expect(decoded!.header.sessionId).toBe(SESSION_CHAT)
    expect(decoded!.header.type).toBe(0)
    expect(new TextDecoder().decode(decoded!.data)).toBe('Hello World')
  })

  it('encodes then decodes a compressed frame', async () => {
    const original = makeTestFrame({ magic: MAGIC_COMPRESSED }, new TextEncoder().encode('Hello World'))
    const wireData = await encodeFrame(original, true)

    const decoded = await decodeFrame(wireData)
    expect(decoded).not.toBeNull()
    expect(decoded!.header.sourceStation).toBe('MYCALL')
    expect(decoded!.header.destStation).toBe('CQCQCQ')
    expect(new TextDecoder().decode(decoded!.data)).toBe('Hello World')
  })

  it('round-trips a frame with binary data', async () => {
    const binaryData = new Uint8Array(256).map((_, i) => i)
    const original = makeTestFrame({}, binaryData)
    const wireData = await encodeFrame(original, false)

    const decoded = await decodeFrame(wireData)
    expect(decoded).not.toBeNull()
    expect(decoded!.data).toEqual(binaryData)
  })

  it('encodes frame matching Python uncompressed wire format', async () => {
    const frame = makeTestFrame({ magic: MAGIC_UNCOMPRESSED }, new TextEncoder().encode('Hello World'))
    const wireData = await encodeFrame(frame, false)
    expect(wireData).toEqual(PYTHON_UNCOMPRESSED)
  })

  it('decodes Python uncompressed wire format', async () => {
    const decoded = await decodeFrame(PYTHON_UNCOMPRESSED)
    expect(decoded).not.toBeNull()
    expect(decoded!.header.sourceStation).toBe('MYCALL')
    expect(decoded!.header.destStation).toBe('CQCQCQ')
    expect(decoded!.header.magic).toBe(MAGIC_UNCOMPRESSED)
    expect(decoded!.header.seq).toBe(0)
    expect(decoded!.header.sessionId).toBe(1)
    expect(decoded!.header.type).toBe(0)
    expect(new TextDecoder().decode(decoded!.data)).toBe('Hello World')
  })

  it('decodes Python compressed wire format', async () => {
    const decoded = await decodeFrame(PYTHON_COMPRESSED)
    expect(decoded).not.toBeNull()
    expect(decoded!.header.sourceStation).toBe('MYCALL')
    expect(decoded!.header.destStation).toBe('CQCQCQ')
    expect(decoded!.header.magic).toBe(MAGIC_COMPRESSED)
    expect(new TextDecoder().decode(decoded!.data)).toBe('Hello World')
  })
})

describe('DDT2 frame edge cases', () => {
  it('rejects truncated data', async () => {
    const result = await decodeFrame(new Uint8Array([0x5b, 0x53, 0x4f, 0x42, 0x5d]))
    expect(result).toBeNull()
  })

  it('rejects junk data', async () => {
    const result = await decodeFrame(new Uint8Array([0x00, 0x01, 0x02, 0x03]))
    expect(result).toBeNull()
  })
})
