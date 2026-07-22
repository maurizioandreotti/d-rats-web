import type { DDT2Frame } from '../types'

export interface SessionHandler {
  sessionId: number
  type: number
  destStation: string
  incoming(frame: DDT2Frame): void
}

export type FrameCallback = (frame: DDT2Frame, portName?: string) => Promise<void>

export class SessionManager {
  private sessions = new Map<number, SessionHandler>()
  private outgoingCallback: FrameCallback | null = null
  private station = 'CQCQCQ'
  private heardStations = new Map<string, number>()
  private stationPorts = new Map<string, string>()
  private nextSessionId = 2

  setOutgoingCallback(cb: FrameCallback): void {
    this.outgoingCallback = cb
  }

  setStation(callsign: string): void {
    this.station = callsign
  }

  getStation(): string {
    return this.station
  }

  registerSession(handler: SessionHandler): void {
    this.sessions.set(handler.sessionId, handler)
  }

  unregisterSession(sessionId: number): void {
    this.sessions.delete(sessionId)
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

    if (sessionId === 0) {
      return
    }

    const session = this.sessions.get(sessionId)
    if (session) {
      session.incoming(frame)
    }
  }

  async outgoing(frame: DDT2Frame, portName?: string): Promise<void> {
    if (!this.outgoingCallback) return

    frame.header.sourceStation = this.station
    if (!frame.header.destStation) {
      frame.header.destStation = 'CQCQCQ'
    }

    await this.outgoingCallback(frame, portName)
  }

  async startSession(_sessionType: number, _destStation: string): Promise<number> {
    const sessionId = this.nextSessionId++
    return sessionId
  }

  async endSession(sessionId: number): Promise<void> {
    this.sessions.delete(sessionId)
  }

  getHeardStations(): Map<string, number> {
    return new Map(this.heardStations)
  }

  manualHeardStation(callsign: string): void {
    this.heardStations.set(callsign, Date.now())
  }

  generateSessionId(): number {
    return this.nextSessionId++
  }
}
