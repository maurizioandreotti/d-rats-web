import type { DDT2Frame } from '../types'
import { SESSION_CHAT } from './ddt2'
import { parseGps } from './gps'
import { SessionManager } from './session-mgr'

export type ChatMessageCallback = (from: string, to: string, text: string) => void
export type PingCallback = (from: string, to: string, type: string, data: string) => void
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
  private pingInfo = ''
  private pingEchoHandlers = new Map<string, { callback: (...args: unknown[]) => void; data: unknown[] }>()

  private onMessage: ChatMessageCallback | null = null
  private onPing: PingCallback | null = null
  private onGpsFix: GpsFixCallback | null = null
  private onStatus: StatusCallback | null = null

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  setOnMessage(cb: ChatMessageCallback): void {
    this.onMessage = cb
  }

  setOnPing(cb: PingCallback): void {
    this.onPing = cb
  }

  setOnGpsFix(cb: GpsFixCallback): void {
    this.onGpsFix = cb
  }

  setOnStatus(cb: StatusCallback): void {
    this.onStatus = cb
  }

  setPingInfo(info: string): void {
    this.pingInfo = info
  }

  async handleIncoming(frame: DDT2Frame): Promise<void> {
    const { sourceStation, destStation, type } = frame.header
    const text = new TextDecoder().decode(frame.data)
    const myCall = this.sessionManager.getStation()

    switch (type) {
      case CHAT_TYPE_DEF: {
        // Skip displaying GPS/NMEA data as chat messages
        if (!text.startsWith('$GP') && !text.startsWith('$$CRC')) {
          this.onMessage?.(sourceStation, destStation, text)
        }
        const fix = parseGps(text)
        if (fix) {
          this.onGpsFix?.(sourceStation, fix.lat, fix.lon)
        }
        break
      }

      case CHAT_TYPE_PING_REQ: {
        this.onPing?.(sourceStation, destStation, 'request', 'Ping Request')
        const isForUs = destStation === myCall || destStation === 'CQCQCQ' || !destStation
        if (!isForUs) break

        if (destStation === 'CQCQCQ') {
          await sleep(Math.random() * 5000)
        }

        const response = this.getPingResponse()
        await this.sendRaw(sourceStation, CHAT_TYPE_PING_RSP, new TextEncoder().encode(response))
        this.onPing?.(myCall, sourceStation, 'response', response)

        await this.sendStatus('D-RATS Web')
        break
      }

      case CHAT_TYPE_PING_RSP: {
        this.onPing?.(sourceStation, destStation, 'response', text)
        break
      }

      case CHAT_TYPE_PING_ERQ: {
        this.onPing?.(sourceStation, destStation, 'echo_request', `Echo request of ${text.length} bytes`)
        const isForUs = destStation === myCall || destStation === 'CQCQCQ' || !destStation
        if (!isForUs) break

        if (destStation === 'CQCQCQ') {
          await sleep(Math.random() * 10000)
        }

        await this.sendRaw(sourceStation, CHAT_TYPE_PING_ERS, frame.data)
        this.onPing?.(myCall, sourceStation, 'echo_response', `Echo of ${text.length} bytes`)
        break
      }

      case CHAT_TYPE_PING_ERS: {
        this.onPing?.(sourceStation, destStation, 'echo_response', `Echo of ${text.length} bytes`)
        const handler = this.pingEchoHandlers.get(sourceStation)
        if (handler) {
          handler.callback(...handler.data)
          this.pingEchoHandlers.delete(sourceStation)
        }
        break
      }

      case CHAT_TYPE_STATUS: {
        const statusByte = parseInt(text[0] ?? '0', 10)
        const statusText = text.slice(1)
        this.onStatus?.(sourceStation, isNaN(statusByte) ? 0 : statusByte, statusText)
        break
      }
    }
  }

  async sendText(text: string, dest = 'CQCQCQ', portName?: string): Promise<void> {
    const textData = new TextEncoder().encode(text)
    await this.sendRaw(dest, CHAT_TYPE_DEF, textData, portName)
  }

  async sendPing(dest: string, data?: string, portName?: string): Promise<void> {
    const pingData = new TextEncoder().encode(data ?? 'Ping Request')
    await this.sendRaw(dest, CHAT_TYPE_PING_REQ, pingData, portName)
  }

  async sendPingEcho(dest: string, data: string, callback?: (...args: unknown[]) => void, ...cbdata: unknown[]): Promise<void> {
    if (callback) {
      this.pingEchoHandlers.set(dest, { callback, data: cbdata })
    }
    const echoData = new TextEncoder().encode(data)
    await this.sendRaw(dest, CHAT_TYPE_PING_ERQ, echoData)
  }

  async sendStatus(message: string): Promise<void> {
    const statusData = new TextEncoder().encode(`1${message}`)
    await this.sendRaw('CQCQCQ', CHAT_TYPE_STATUS, statusData)
  }

  private getPingResponse(): string {
    if (!this.pingInfo) return 'Running D-RATS Web'
    return this.pingInfo
  }

  private async sendRaw(dest: string, type: number, data: Uint8Array, portName?: string): Promise<void> {
    const frame: DDT2Frame = {
      header: {
        magic: 0x22,
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
    await this.sessionManager.outgoing(frame, portName)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
