const OFFSET = 64
const ESCAPE = 0x3d // '='

const DEFAULT_BANNED = new Uint8Array([
  0x11, 0x13, 0x1a, 0x00, 0x84, 0xe7, 0xfd, 0xfe, 0xff, 0xc0, 0xdb,
])

export function yencode(data: Uint8Array, banned: Uint8Array = DEFAULT_BANNED): Uint8Array {
  const out: number[] = []
  for (const byte of data) {
    if (banned.includes(byte) || byte === ESCAPE) {
      out.push(ESCAPE, (byte + OFFSET) & 0xff)
    } else {
      out.push(byte)
    }
  }
  return new Uint8Array(out)
}

export function ydecode(data: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const byte = data[i]!
    if (byte === ESCAPE) {
      i++
      if (i < data.length) {
        const val = (data[i]! - OFFSET) & 0xff
        out.push(val)
      }
    } else {
      out.push(byte)
    }
    i++
  }
  return new Uint8Array(out)
}
