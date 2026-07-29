import { describe, it, expect, vi } from 'vitest'
import { SessionManager } from './session-mgr'
import type { DDT2Frame } from '../types'

function makeFrame(destStation: string): DDT2Frame {
  return {
    header: {
      magic: 0x22,
      seq: 0,
      sessionId: 2,
      type: 0,
      checksum: 0,
      length: 0,
      sourceStation: '',
      destStation,
    },
    data: new Uint8Array(),
  }
}

describe('SessionManager port routing', () => {
  it('routes an outgoing frame to whichever port the destination was last heard on', async () => {
    const sessionMgr = new SessionManager()
    sessionMgr.setStation('W1AAA')
    const outgoingCallback = vi.fn(async () => {})
    sessionMgr.setOutgoingCallback(outgoingCallback)

    sessionMgr.heardOnPort('W1BBB', 'Radio')

    await sessionMgr.outgoing(makeFrame('W1BBB'))

    expect(outgoingCallback).toHaveBeenCalledWith(expect.anything(), 'Radio')
  })

  it('an explicit portName argument still wins over the heard-on-port lookup', async () => {
    const sessionMgr = new SessionManager()
    sessionMgr.setStation('W1AAA')
    const outgoingCallback = vi.fn(async () => {})
    sessionMgr.setOutgoingCallback(outgoingCallback)

    sessionMgr.heardOnPort('W1BBB', 'Radio')

    await sessionMgr.outgoing(makeFrame('W1BBB'), 'RAT')

    expect(outgoingCallback).toHaveBeenCalledWith(expect.anything(), 'RAT')
  })

  it('falls back to no explicit port when the destination has never been heard', async () => {
    const sessionMgr = new SessionManager()
    sessionMgr.setStation('W1AAA')
    const outgoingCallback = vi.fn(async () => {})
    sessionMgr.setOutgoingCallback(outgoingCallback)

    await sessionMgr.outgoing(makeFrame('W1CCC'))

    expect(outgoingCallback).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('re-routes to a station\'s most recently heard port, not a stale one', async () => {
    const sessionMgr = new SessionManager()
    sessionMgr.setStation('W1AAA')
    const outgoingCallback = vi.fn(async () => {})
    sessionMgr.setOutgoingCallback(outgoingCallback)

    sessionMgr.heardOnPort('W1BBB', 'Radio')
    sessionMgr.heardOnPort('W1BBB', 'RAT')

    await sessionMgr.outgoing(makeFrame('W1BBB'))

    expect(outgoingCallback).toHaveBeenCalledWith(expect.anything(), 'RAT')
  })

  it('ignores a remembered port that is no longer connected instead of routing a reply into it', async () => {
    const sessionMgr = new SessionManager()
    sessionMgr.setStation('W1AAA')
    const outgoingCallback = vi.fn(async () => {})
    sessionMgr.setOutgoingCallback(outgoingCallback)
    // TransportManager.sendFrame() throws on an unknown port name rather than
    // falling back, so a stale entry here would drop the reply entirely.
    sessionMgr.setIsPortConnected((portName) => portName === 'Radio')

    sessionMgr.heardOnPort('W1BBB', 'RAT')

    await sessionMgr.outgoing(makeFrame('W1BBB'))

    expect(outgoingCallback).toHaveBeenCalledWith(expect.anything(), undefined)
  })
})
