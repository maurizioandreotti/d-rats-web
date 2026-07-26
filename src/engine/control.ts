// Wire format for the control session (DDT2 session id 0): negotiates a
// remote session id before any stateful session (e.g. file transfer) can
// exchange data, and tears sessions back down when finished.

export const CONTROL_TYPE_PING = 0
export const CONTROL_TYPE_END = 1
export const CONTROL_TYPE_ACK = 2
export const CONTROL_TYPE_NEW_BASE = 3

export const SESSION_TYPE_GENERAL = 1
export const SESSION_TYPE_SOCKET = 4
export const SESSION_TYPE_FILEXFER = 5
export const SESSION_TYPE_FORMXFER = 6
export const SESSION_TYPE_RPC = 7

export function newSessionControlType(sessionType: number): number {
  return CONTROL_TYPE_NEW_BASE + sessionType
}

export function encodeNewSessionRequest(localId: number, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name)
  const data = new Uint8Array(1 + nameBytes.length)
  data[0] = localId & 0xff
  data.set(nameBytes, 1)
  return data
}

export function decodeNewSessionRequest(data: Uint8Array): { localId: number; name: string } | null {
  if (data.length < 1) return null
  return { localId: data[0]!, name: new TextDecoder().decode(data.slice(1)) }
}

export function encodeSessionAck(requesterId: number, ownId: number): Uint8Array {
  return new Uint8Array([requesterId & 0xff, ownId & 0xff])
}

export function decodeSessionAck(data: Uint8Array): { requesterId: number; peerId: number } | null {
  if (data.length < 2) return null
  return { requesterId: data[0]!, peerId: data[1]! }
}

export function encodeSessionEnd(id: number): Uint8Array {
  return new TextEncoder().encode(String(id))
}

export function decodeSessionEnd(data: Uint8Array): number | null {
  const id = parseInt(new TextDecoder().decode(data), 10)
  return isNaN(id) ? null : id
}
