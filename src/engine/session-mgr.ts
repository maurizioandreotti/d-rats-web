import type { DDT2Frame } from '../types'
import { SESSION_CONTROL, SESSION_CHAT, SESSION_RPC } from './ddt2'
import {
  CONTROL_TYPE_ACK,
  CONTROL_TYPE_END,
  CONTROL_TYPE_NEW_BASE,
  newSessionControlType,
  encodeNewSessionRequest,
  decodeNewSessionRequest,
  encodeSessionAck,
  decodeSessionAck,
  encodeSessionEnd,
  decodeSessionEnd,
} from './control'

export type FrameCallback = (frame: DDT2Frame, portName?: string) => Promise<void>
export type IncomingSessionCallback = (
  localId: number,
  sessionType: number,
  sourceStation: string,
  name: string,
) => void
export type RpcFrameCallback = (frame: DDT2Frame) => Promise<void>

interface SessionRecord {
  localId: number
  remoteId: number | null
  destStation: string
  sessionType: number
  name: string
  state: 'sync' | 'open' | 'closed'
}

// Matches D-RATS's own new_session() retry schedule (control.py): 10
// attempts, ~5s wait for the first, ~15s for the rest — tuned for slow,
// half-duplex packet-radio links. A tighter interval (this port's original
// 5×3s) retransmits before a real peer's ack has any chance to arrive,
// which shows up on the peer's side as the same "new session" request
// appearing to fire 2-3 times for what's really just one negotiation.
const NEW_SESSION_RETRIES = 10
const NEW_SESSION_RETRY_MS_FIRST = 5000
const NEW_SESSION_RETRY_MS_REST = 15000
const END_SESSION_RETRIES = 3
const END_SESSION_RETRY_MS = 10000

export class SessionManager {
  private sessions = new Map<number, SessionRecord>()
  private outgoingCallback: FrameCallback | null = null
  private station = 'CQCQCQ'
  private heardStations = new Map<string, number>()
  private stationPorts = new Map<string, string>()
  // 0=control, 1=chat, 2=rpc are fixed slots; dynamically negotiated
  // sessions (e.g. file transfer) start allocating from 3.
  private nextSessionId = 3

  // Configurable retry timing (for testing)
  private newSessionRetries = NEW_SESSION_RETRIES
  private newSessionRetryMsFirst = NEW_SESSION_RETRY_MS_FIRST
  private newSessionRetryMsRest = NEW_SESSION_RETRY_MS_REST
  private endSessionRetries = END_SESSION_RETRIES
  private endSessionRetryMs = END_SESSION_RETRY_MS

  setRetryTiming(opts: {
    newSessionRetries?: number
    newSessionRetryMsFirst?: number
    newSessionRetryMsRest?: number
    endSessionRetries?: number
    endSessionRetryMs?: number
  }): void {
    if (opts.newSessionRetries !== undefined) this.newSessionRetries = opts.newSessionRetries
    if (opts.newSessionRetryMsFirst !== undefined) this.newSessionRetryMsFirst = opts.newSessionRetryMsFirst
    if (opts.newSessionRetryMsRest !== undefined) this.newSessionRetryMsRest = opts.newSessionRetryMsRest
    if (opts.endSessionRetries !== undefined) this.endSessionRetries = opts.endSessionRetries
    if (opts.endSessionRetryMs !== undefined) this.endSessionRetryMs = opts.endSessionRetryMs
  }

  private pendingAcks = new Map<number, (peerId: number) => void>()
  private pendingEnds = new Map<number, () => void>()
  private onIncomingSession: IncomingSessionCallback | null = null
  private onRpcFrame: RpcFrameCallback | null = null
  private onOutgoing: ((frame: DDT2Frame, portName?: string) => void) | null = null
  private onMissingRemoteId: ((localId: number, hasRecord: boolean) => void) | null = null
  private isPortConnected: ((portName: string) => boolean) | null = null

  setOutgoingCallback(cb: FrameCallback): void {
    this.outgoingCallback = cb
  }

  // Fires for every frame actually sent, after id/station rewriting — the
  // only way to observe what this station transmits, since Transport's
  // onFrame callback only ever fires for received frames.
  setOnOutgoing(cb: (frame: DDT2Frame, portName?: string) => void): void {
    this.onOutgoing = cb
  }

  // Lets outgoing() check a remembered port is still usable before routing a
  // reply to it. Without this, a station heard on a port that has since been
  // disconnected makes TransportManager.sendFrame() throw instead of falling
  // back to a connected port, and the reply is dropped with no trace.
  setIsPortConnected(cb: (portName: string) => boolean): void {
    this.isPortConnected = cb
  }

  // Diagnostic: fires if we're about to send on a negotiated session for
  // which we don't (yet, or ever) know the peer's chosen id — the frame
  // will go out carrying our own local id instead, which only reaches the
  // peer if it happens to have picked the same number independently.
  setOnMissingRemoteId(cb: (localId: number, hasRecord: boolean) => void): void {
    this.onMissingRemoteId = cb
  }

  // Incoming RPC frames (negotiated session ID, not fixed 2)
  setOnRpcFrame(cb: RpcFrameCallback): void {
    this.onRpcFrame = cb
  }

  setStation(callsign: string): void {
    this.station = callsign
  }

  getStation(): string {
    return this.station
  }

  // Called when a peer opens a new stateful session against us (e.g. an
  // incoming file-transfer offer). The session is already registered and
  // acked by the time this fires.
  setOnIncomingSession(cb: IncomingSessionCallback): void {
    this.onIncomingSession = cb
  }

  heardOnPort(callsign: string, portName: string): void {
    this.stationPorts.set(callsign, portName)
  }

  getPortForStation(callsign: string): string | undefined {
    return this.stationPorts.get(callsign)
  }

  async incoming(frame: DDT2Frame): Promise<void> {
    const { sessionId, sourceStation } = frame.header

    this.heardStations.set(sourceStation, Date.now())

    if (sessionId === SESSION_CONTROL) {
      this.handleControlFrame(frame)
    } else if (this.onRpcFrame) {
      // Negotiated RPC session: route to RPCEngine
      // Check if this sessionId belongs to an open RPC session for this source
      for (const record of this.sessions.values()) {
        if (
          record.sessionType === 7 &&
          record.remoteId === sessionId &&
          record.destStation === sourceStation &&
          record.state === 'open'
        ) {
          await this.onRpcFrame(frame)
          return
        }
      }
    }
  }

  private handleControlFrame(frame: DDT2Frame): void {
    const { type, sourceStation, destStation } = frame.header
    if (destStation !== this.station) return

    if (type === CONTROL_TYPE_ACK) {
      const parsed = decodeSessionAck(frame.data)
      if (!parsed) return

      const record = this.sessions.get(parsed.requesterId)
      if (!record) return

      record.remoteId = parsed.peerId
      if (record.state === 'sync') record.state = 'open'

      const resolve = this.pendingAcks.get(parsed.requesterId)
      if (resolve) {
        resolve(parsed.peerId)
        this.pendingAcks.delete(parsed.requesterId)
      }
      return
    }

    if (type === CONTROL_TYPE_END) {
      const localId = decodeSessionEnd(frame.data)
      if (localId === null) return

      const record = this.sessions.get(localId)
      // Already closed on our side: this is the peer's echo of our own echo
      // (or a stray duplicate). Drop it silently instead of echoing forever.
      if (!record) return

      const replyId = record.remoteId ?? localId
      record.state = 'closed'
      this.sessions.delete(localId)

      // Echo the end-of-session message back, same as a real D-RATS peer,
      // so whichever side initiated the close can stop waiting.
      void this.sendControlFrame(sourceStation, CONTROL_TYPE_END, encodeSessionEnd(replyId))

      const resolve = this.pendingEnds.get(localId)
      if (resolve) {
        resolve()
        this.pendingEnds.delete(localId)
      }
      return
    }

    if (type >= CONTROL_TYPE_NEW_BASE) {
      const parsed = decodeNewSessionRequest(frame.data)
      if (!parsed) return
      const sessionType = type - CONTROL_TYPE_NEW_BASE

      const existing = [...this.sessions.values()].find(
        (s) => s.remoteId === parsed.localId && s.destStation === sourceStation,
      )
      if (existing) {
        void this.sendControlFrame(
          sourceStation,
          CONTROL_TYPE_ACK,
          encodeSessionAck(parsed.localId, existing.localId),
        )
        return
      }

      const localId = this.generateSessionId()
      this.sessions.set(localId, {
        localId,
        remoteId: parsed.localId,
        destStation: sourceStation,
        sessionType,
        name: parsed.name,
        state: 'open',
      })

      void this.sendControlFrame(sourceStation, CONTROL_TYPE_ACK, encodeSessionAck(parsed.localId, localId))
      this.onIncomingSession?.(localId, sessionType, sourceStation, parsed.name)
    }
  }

  private async sendControlFrame(dest: string, type: number, data: Uint8Array): Promise<void> {
    const frame: DDT2Frame = {
      header: {
        magic: 0xdd,
        seq: 0,
        sessionId: SESSION_CONTROL,
        type,
        checksum: 0,
        length: data.length,
        sourceStation: this.station,
        destStation: dest,
      },
      data,
    }
    await this.outgoing(frame)
  }

  async outgoing(frame: DDT2Frame, portName?: string): Promise<void> {
    if (!this.outgoingCallback) return

    frame.header.sourceStation = this.station
    if (!frame.header.destStation) {
      frame.header.destStation = 'CQCQCQ'
    }

    // Replies (RPC acks, file-transfer ACK/REQACK/DAT, control-channel
    // acks) are constructed without ever knowing which port the original
    // request arrived on — chat.ts/file.ts/rpc.ts all just call outgoing()
    // with no portName. Without this, TransportManager.sendFrame() falls
    // back to "first connected port", which silently sends the reply out
    // the wrong port whenever more than one is connected, and the
    // requester never sees it. heardOnPort() already records which port
    // every station was last heard on — use it here instead of threading
    // a portName parameter through every call site. A remembered port that
    // is no longer connected is ignored rather than used: sendFrame() throws
    // on an unknown port name, so trusting a stale entry would silently drop
    // the reply instead of sending it out a port that still works.
    let resolvedPort = portName
    if (!resolvedPort) {
      const remembered = this.stationPorts.get(frame.header.destStation)
      if (remembered && (this.isPortConnected?.(remembered) ?? true)) {
        resolvedPort = remembered
      }
    }

    // Sessions negotiated over the control channel are addressed on the wire
    // using the *peer's* chosen id for the session, not our own local id.
    // SESSION_RPC (fixed slot 2) is never negotiated, so it's also excluded.
    if (
      frame.header.sessionId !== SESSION_CONTROL &&
      frame.header.sessionId !== SESSION_CHAT &&
      frame.header.sessionId !== SESSION_RPC
    ) {
      const localId = frame.header.sessionId
      const record = this.sessions.get(localId)
      if (record?.remoteId != null) {
        frame.header.sessionId = record.remoteId
      } else {
        this.onMissingRemoteId?.(localId, record !== undefined)
      }
    }

    this.onOutgoing?.(frame, resolvedPort)
    await this.outgoingCallback(frame, resolvedPort)
  }

  // Negotiates a new stateful session with `destStation` over the control
  // channel, retrying the request until acked. Resolves to the local session
  // id (use this to key all further engine-level bookkeeping); outgoing()
  // takes care of translating it to the peer's id on the wire.
  async startSession(sessionType: number, destStation: string, name = ''): Promise<number> {
    const localId = this.generateSessionId()
    this.sessions.set(localId, {
      localId,
      remoteId: null,
      destStation,
      sessionType,
      name,
      state: 'sync',
    })

    for (let attempt = 0; attempt < this.newSessionRetries; attempt++) {
      const waitMs = attempt === 0 ? this.newSessionRetryMsFirst : this.newSessionRetryMsRest
      const peerId = await new Promise<number | null>((resolve) => {
        this.pendingAcks.set(localId, resolve)
        void this.sendControlFrame(
          destStation,
          newSessionControlType(sessionType),
          encodeNewSessionRequest(localId, name),
        )
        setTimeout(() => {
          if (this.pendingAcks.has(localId)) {
            this.pendingAcks.delete(localId)
            resolve(null)
          }
        }, waitMs)
      })

      if (peerId !== null) return localId
    }

    this.sessions.delete(localId)
    throw new Error(`No response establishing session with ${destStation}`)
  }

  async endSession(localId: number): Promise<void> {
    const record = this.sessions.get(localId)
    if (!record) return

    const targetId = record.remoteId ?? localId

    for (let attempt = 0; attempt < this.endSessionRetries; attempt++) {
      const closed = await new Promise<boolean>((resolve) => {
        this.pendingEnds.set(localId, () => resolve(true))
        void this.sendControlFrame(record.destStation, CONTROL_TYPE_END, encodeSessionEnd(targetId))
        setTimeout(() => {
          if (this.pendingEnds.has(localId)) {
            this.pendingEnds.delete(localId)
            resolve(false)
          }
        }, this.endSessionRetryMs)
      })
      if (closed) break
    }

    this.sessions.delete(localId)
  }

  getSessionDest(localId: number): string | undefined {
    return this.sessions.get(localId)?.destStation
  }

  getHeardStations(): Map<string, number> {
    return new Map(this.heardStations)
  }

  manualHeardStation(callsign: string): void {
    this.heardStations.set(callsign, Date.now())
  }

  generateSessionId(): number {
    if (this.nextSessionId > 254) {
      for (let id = 3; id <= 254; id++) {
        if (!this.sessions.has(id)) return id
      }
      throw new Error('No free session IDs available')
    }
    return this.nextSessionId++
  }
}
