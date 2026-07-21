import type { DDT2Frame } from '../types'

export class SessionManager {
  // TODO: implement session routing (0-255), heard stations, frame dispatch

  incoming(frame: DDT2Frame): void {
    throw new Error('Not implemented')
  }

  outgoing(frame: DDT2Frame): void {
    throw new Error('Not implemented')
  }

  startSession(type: number, dest: string): number {
    throw new Error('Not implemented')
  }

  endSession(sessionId: number): void {
    throw new Error('Not implemented')
  }
}
