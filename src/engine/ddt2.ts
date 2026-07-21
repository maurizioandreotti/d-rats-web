import type { DDT2Frame, DDT2Header } from '../types'

export const MAGIC_COMPRESSED = 0xdd
export const MAGIC_UNCOMPRESSED = 0x22
export const HEADER_SIZE = 25
export const SESSION_CONTROL = 0
export const SESSION_CHAT = 1

export function encodeFrame(frame: DDT2Frame): Uint8Array {
  // TODO: implement DDT2 frame encoding (header struct + optional zlib)
  throw new Error('Not implemented')
}

export function decodeFrame(data: Uint8Array): DDT2Frame {
  // TODO: implement DDT2 frame decoding
  throw new Error('Not implemented')
}

function parseHeader(data: Uint8Array): DDT2Header {
  // TODO: parse 25-byte header: !BHBBHH8s8s
  throw new Error('Not implemented')
}
