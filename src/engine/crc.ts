export function computeCrc(data: Uint8Array): number {
  let crc = 0
  for (const byte of data) {
    let c = byte
    for (let i = 0; i < 8; i++) {
      c <<= 1
      const value = (c & 0x400) !== 0 ? 1 : 0
      if (crc & 0x8000) {
        crc = ((crc << 1) + value) ^ 0x1021
      } else {
        crc = (crc << 1) + value
      }
    }
    crc &= 0xffff
  }

  for (let i = 0; i < 2; i++) {
    let c = 0
    for (let j = 0; j < 8; j++) {
      c <<= 1
      const value = (c & 0x400) !== 0 ? 1 : 0
      if (crc & 0x8000) {
        crc = ((crc << 1) + value) ^ 0x1021
      } else {
        crc = (crc << 1) + value
      }
    }
    crc &= 0xffff
  }

  return crc
}

export function verifyCrc(data: Uint8Array, expected: number): boolean {
  return computeCrc(data) === expected
}
