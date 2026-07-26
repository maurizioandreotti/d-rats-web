import { describe, it, expect } from 'vitest'
import { SessionManager } from './session-mgr'
import { FileTransferEngine } from './file'
import { SESSION_CONTROL } from './ddt2'
import type { DDT2Frame } from '../types'

// Wires two independent SessionManager/FileTransferEngine pairs together as if
// they were two stations talking over a shared radio link, so the control-
// channel handshake and windowed ACK/REQACK exchange can be exercised without
// a real serial device or a second D-RATS peer.
function makeLinkedStation(callsign: string) {
  const sessionMgr = new SessionManager()
  sessionMgr.setStation(callsign)
  const fileTransfer = new FileTransferEngine(sessionMgr)
  return { sessionMgr, fileTransfer }
}

function link(
  a: ReturnType<typeof makeLinkedStation>,
  b: ReturnType<typeof makeLinkedStation>,
) {
  const route = (
    from: ReturnType<typeof makeLinkedStation>,
    to: ReturnType<typeof makeLinkedStation>,
  ) => {
    from.sessionMgr.setOutgoingCallback(async (frame: DDT2Frame) => {
      await to.sessionMgr.incoming(frame)
      if (frame.header.sessionId !== SESSION_CONTROL) {
        await to.fileTransfer.handleIncoming(frame)
      }
    })
  }
  route(a, b)
  route(b, a)
}

describe('file transfer end-to-end (control handshake + windowed ACK)', () => {
  it('negotiates a session and transfers a multi-block file', async () => {
    const stationA = makeLinkedStation('W1AAA')
    const stationB = makeLinkedStation('W1BBB')
    link(stationA, stationB)

    let offeredSessionId: number | null = null
    stationB.fileTransfer.setOnOffer((filename, _size, sessionId) => {
      expect(filename).toBe('test.bin')
      offeredSessionId = sessionId
      void stationB.fileTransfer.acceptOffer(sessionId)
    })

    const original = new Uint8Array(3000)
    for (let i = 0; i < original.length; i++) original[i] = i % 256

    const sessionId = await stationA.fileTransfer.sendFile('test.bin', original, 'W1BBB')

    expect(offeredSessionId).not.toBeNull()

    const received = stationB.fileTransfer.getCompletedData(offeredSessionId!)
    expect(received).not.toBeNull()
    expect(received).toEqual(original)

    // Sender's own bookkeeping should also reflect completion.
    expect(stationA.fileTransfer.getTransfer(sessionId)?.phase).toBe('complete')
  }, 15000)

  it('rejects an offer and does not deliver data', async () => {
    const stationA = makeLinkedStation('W1CCC')
    const stationB = makeLinkedStation('W1DDD')
    link(stationA, stationB)

    let offeredSessionId: number | null = null
    stationB.fileTransfer.setOnOffer((_filename, _size, sessionId) => {
      offeredSessionId = sessionId
      stationB.fileTransfer.rejectFile(sessionId)
    })

    const original = new Uint8Array([1, 2, 3, 4])

    // The sender will never get a start-of-transfer response since the
    // receiver rejected instead of accepting, so it should time out and fail
    // rather than silently "succeed".
    await expect(stationA.fileTransfer.sendFile('rejected.bin', original, 'W1DDD')).rejects.toThrow()

    expect(offeredSessionId).not.toBeNull()
    expect(stationB.fileTransfer.getCompletedData(offeredSessionId!)).toBeNull()
  }, 40000)
})
