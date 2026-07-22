function updateCrc(crc: number, data: Uint8Array): number {
  for (const byte of data) {
    let c = byte
    for (let i = 0; i < 8; i++) {
      c <<= 1
      const value = (c & 0x100) !== 0 ? 1 : 0
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

export function computeCrc(data: Uint8Array): number {
  let crc = updateCrc(0, data)
  crc = updateCrc(crc, new Uint8Array([0, 0]))
  return crc
}

export function verifyCrc(data: Uint8Array, expected: number): boolean {
  return computeCrc(data) === expected
}
