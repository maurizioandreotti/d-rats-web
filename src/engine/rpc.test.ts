import { describe, it, expect } from 'vitest'
import { SessionManager } from './session-mgr'
import { FileTransferEngine } from './file'
import { RPCEngine, encodeDict, decodeDict } from './rpc'
import { SESSION_CONTROL, SESSION_RPC } from './ddt2'
import type { DDT2Frame } from '../types'

// Wires two independent SessionManager/RPCEngine/FileTransferEngine trios
// together as if they were two stations talking over a shared radio link,
// mirroring file-transfer.test.ts's approach but routing RPC-session frames
// to the RPC engine instead of falling through to file transfer.
function makeLinkedStation(callsign: string) {
  const sessionMgr = new SessionManager()
  sessionMgr.setStation(callsign)
  const fileTransfer = new FileTransferEngine(sessionMgr)
  const rpc = new RPCEngine(sessionMgr)
  rpc.setFileTransferEngine(fileTransfer)
  return { sessionMgr, fileTransfer, rpc }
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
      const { sessionId } = frame.header
      if (sessionId === SESSION_CONTROL) return
      if (sessionId === SESSION_RPC) {
        await to.rpc.handleIncoming(frame)
      } else {
        await to.fileTransfer.handleIncoming(frame)
      }
    })
  }
  route(a, b)
  route(b, a)
}

describe('RPC dict encoding', () => {
  it('round-trips a multi-key dict', () => {
    const dict = { rc: 'OK', msg: 'hello world' }
    expect(decodeDict(encodeDict(dict))).toEqual(dict)
  })

  it('round-trips an empty dict', () => {
    expect(decodeDict('')).toEqual({})
    expect(decodeDict(encodeDict({}))).toEqual({})
  })
})

describe('RPC file list + pull end-to-end', () => {
  it('lists a remote station\'s shared files', async () => {
    const stationA = makeLinkedStation('W2AAA')
    const stationB = makeLinkedStation('W2BBB')
    link(stationA, stationB)

    stationB.rpc.setFileProvider({
      list: () => [{ name: 'readme.txt', info: '1.0 KB (just now)' }],
      get: () => null,
    })

    const files = await stationA.rpc.listFiles('W2BBB')
    expect(files).toEqual([{ name: 'readme.txt', info: '1.0 KB (just now)' }])
  })

  it('pulling a shared file triggers a real file transfer', async () => {
    const stationA = makeLinkedStation('W2CCC')
    const stationB = makeLinkedStation('W2DDD')
    link(stationA, stationB)

    const original = new Uint8Array([9, 8, 7, 6, 5])
    stationB.rpc.setFileProvider({
      list: () => [{ name: 'data.bin', info: '5 B' }],
      get: (name) => (name === 'data.bin' ? original : null),
    })

    let offeredSessionId: number | null = null
    let resolveDone: () => void
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve
    })

    stationA.fileTransfer.setOnOffer((filename, _size, sessionId) => {
      expect(filename).toBe('data.bin')
      offeredSessionId = sessionId
      void stationA.fileTransfer.acceptOffer(sessionId)
    })
    stationA.fileTransfer.setOnProgress((_filename, transferred, total) => {
      if (transferred >= total) resolveDone()
    })

    const result = await stationA.rpc.pullFile('W2DDD', 'data.bin')
    expect(result).toEqual({ ok: true, message: 'OK' })

    await done

    expect(offeredSessionId).not.toBeNull()
    expect(stationA.fileTransfer.getCompletedData(offeredSessionId!)).toEqual(original)
  }, 15000)

  it('reports an error pulling a file that was never shared', async () => {
    const stationA = makeLinkedStation('W2EEE')
    const stationB = makeLinkedStation('W2FFF')
    link(stationA, stationB)

    stationB.rpc.setFileProvider({ list: () => [], get: () => null })

    const result = await stationA.rpc.pullFile('W2FFF', 'missing.bin')
    expect(result).toEqual({ ok: false, message: 'File not found' })
  })
})
