import type { DDT2Frame } from '../types'
import { SESSION_CHAT } from './ddt2'
import { parseGps } from './gps'
import { SessionManager } from './session-mgr'

export type ChatMessageCallback = (from: string, to: string, text: string) => void
export type PingCallback = (from: string, to: string, data: string) => void
export type GpsFixCallback = (from: string, lat: number, lon: number) => void
export type StatusCallback = (from: string, status: number, message: string) => void

export const CHAT_TYPE_DEF = 0
export const CHAT_TYPE_PING_REQ = 1
export const CHAT_TYPE_PING_RSP = 2
export const CHAT_TYPE_PING_ERQ = 3
export const CHAT_TYPE_PING_ERS = 4
export const CHAT_TYPE_STATUS = 5

export class ChatEngine {
  private sessionManager: SessionManager
  private sessionId = SESSION_CHAT

  private onMessage: ChatMessageCallback | null = null
  private onPingRequest: PingCallback | null = null
  private onPingResponse: PingCallback | null = null
  private onGpsFix: GpsFixCallback | null = null
  private onStatus: StatusCallback | null = null

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  setOnMessage(cb: ChatMessageCallback): void {
    this.onMessage = cb
  }

  setOnPingRequest(cb: PingCallback): void {
    this.onPingRequest = cb
  }

  setOnPingResponse(cb: PingCallback): void {
    this.onPingResponse = cb
  }

  setOnGpsFix(cb: GpsFixCallback): void {
    this.onGpsFix = cb
  }

  setOnStatus(cb: StatusCallback): void {
    this.onStatus = cb
  }

  async handleIncoming(frame: DDT2Frame): Promise<void> {
    const { sourceStation, destStation, type } = frame.header
    const text = new TextDecoder().decode(frame.data)

    switch (type) {
      case CHAT_TYPE_DEF: {
        this.onMessage?.(sourceStation, destStation, text)

        const fix = parseGps(text)
        if (fix) {
          this.onGpsFix?.(sourceStation, fix.lat, fix.lon)
        }
        break
      }

      case CHAT_TYPE_PING_REQ: {
        this.onPingRequest?.(sourceStation, destStation, text)
        await this.sendRaw(sourceStation, CHAT_TYPE_PING_RSP, frame.data)
        break
      }

      case CHAT_TYPE_PING_RSP: {
        this.onPingResponse?.(sourceStation, destStation, text)
        break
      }

      case CHAT_TYPE_PING_ERQ: {
        await this.sendRaw(sourceStation, CHAT_TYPE_PING_ERS, frame.data)
        break
      }

      case CHAT_TYPE_PING_ERS: {
        this.onPingResponse?.(sourceStation, destStation, text)
        break
      }

      case CHAT_TYPE_STATUS: {
        this.onStatus?.(sourceStation, 1, text)
        break
      }
    }
  }

  async sendText(text: string, dest = 'CQCQCQ'): Promise<void> {
    const textData = new TextEncoder().encode(text)
    await this.sendRaw(dest, CHAT_TYPE_DEF, textData)
  }

  async sendPing(dest = 'CQCQCQ', data?: string): Promise<void> {
    const pingData = new TextEncoder().encode(data ?? 'ping')
    await this.sendRaw(dest, CHAT_TYPE_PING_REQ, pingData)
  }

  async sendStatus(message: string): Promise<void> {
    const statusData = new TextEncoder().encode(message)
    await this.sendRaw('CQCQCQ', CHAT_TYPE_STATUS, statusData)
  }

  private async sendRaw(dest: string, type: number, data: Uint8Array): Promise<void> {
    const frame: DDT2Frame = {
      header: {
        magic: 0xdd,
        seq: 0,
        sessionId: this.sessionId,
        type,
        checksum: 0,
        length: data.length,
        sourceStation: this.sessionManager.getStation(),
        destStation: dest,
      },
      data,
    }
    await this.sessionManager.outgoing(frame)
  }
}
