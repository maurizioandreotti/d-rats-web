export function computeCrc(data: Uint8Array): number {
  // TODO: implement 16-bit CRC used by DDT2 (custom polynomial)
  throw new Error('Not implemented')
}

export function verifyCrc(data: Uint8Array, expected: number): boolean {
  return computeCrc(data) === expected
}
