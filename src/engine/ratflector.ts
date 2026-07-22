import { ENCODED_HEADER, ENCODED_TRAILER, decodeFrame, encodeFrame } from './ddt2'
import type { DDT2Frame } from '../types'

export type RatflectorStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const AUTH_TIMEOUT = 10000

export class RatflectorConnection {
  private ws: WebSocket | null = null
  private buffer = new Uint8Array(0)
  private onFrame: ((frame: DDT2Frame) => void) | null = null
  private onStatus: ((status: RatflectorStatus, message: string) => void) | null = null
  private authenticated = false
  private errored = false
  private authQueue: Array<{ code: number; message: string }> = []
  private authResolve: ((value: { code: number; message: string } | null) => void) | null = null
  private authTimer: ReturnType<typeof setTimeout> | null = null

  setOnFrame(cb: (frame: DDT2Frame) => void): void {
    this.onFrame = cb
  }

  setOnStatus(cb: (status: RatflectorStatus, message: string) => void): void {
    this.onStatus = cb
  }

  async connect(host: string, port: number, callsign: string, password: string, bridgeUrl?: string): Promise<void> {
    this.authenticated = false
    this.errored = false
    this.authQueue = []
    this.authResolve = null
    if (this.authTimer) clearTimeout(this.authTimer)
    this.authTimer = null

    const bridge = bridgeUrl || 'ws://localhost:9001'
    const url = `${bridge}/?host=${encodeURIComponent(host)}&port=${port}`
    this.onStatus?.('connecting', `Connecting to ${host}:${port} via ${bridge}...`)

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
      } catch {
        this.onStatus?.('error', 'Failed to create WebSocket to bridge')
        reject(new Error('Failed to create WebSocket to bridge'))
        return
      }

      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = async () => {
        try {
          await this.doAuth(callsign, password)
          resolve()
        } catch (err) {
          this.ws?.close()
          reject(err)
        }
      }

      this.ws.onmessage = (event) => {
        const data = event.data
        const typeName = data instanceof ArrayBuffer
          ? `ArrayBuffer(${data.byteLength})`
          : typeof data
        console.log(`[ratflector] onmessage type=${typeName}`)
        if (data instanceof ArrayBuffer) {
          if (!this.authenticated) {
            const text = new TextDecoder().decode(data)
            const match = text.match(/^(\d{3})\s+(.*)/)
            if (match) {
              const item = { code: parseInt(match[1]!, 10), message: (match[2] ?? '').trim() }
              console.log(`[ratflector] auth code=${item.code} msg=${item.message}`)
              if (this.authResolve) {
                this.authResolve(item)
                this.authResolve = null
              } else {
                this.authQueue.push(item)
              }
              return
            } else {
              console.log(`[ratflector] non-auth binary during auth: ${text.slice(0, 60)}`)
            }
          }
          this.buffer = concat(this.buffer, new Uint8Array(data))
          this.parseFrames()
        } else {
          console.log(`[ratflector] non-binary message: ${data}`)
        }
      }

      this.ws.onclose = (ev) => {
        console.log(`[ratflector] onclose code=${ev.code} reason=${ev.reason} wasClean=${ev.wasClean}`)
        this.authenticated = false
        if (!this.errored) {
          this.onStatus?.('disconnected', `Connection closed (${ev.reason || 'remote'})`)
        }
      }

      this.ws.onerror = () => {
        console.log('[ratflector] onerror')
        this.errored = true
        this.onStatus?.('error', 'WebSocket error — is the bridge running at ws://localhost:9001?')
        reject(new Error('WebSocket error (bridge not reachable)'))
      }
    })
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.buffer = new Uint8Array(0)
    this.authenticated = false
    this.authQueue = []
    this.authResolve = null
    if (this.authTimer) clearTimeout(this.authTimer)
    this.authTimer = null
    this.onStatus?.('disconnected', 'Disconnected')
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.authenticated
  }

  async sendFrame(frame: DDT2Frame): Promise<void> {
    if (!this.isConnected) throw new Error('Not connected to ratflector')
    const wireData = await encodeFrame(frame)
    this.ws!.send(wireData.buffer as ArrayBuffer)
  }

  private waitForAuthLine(): Promise<{ code: number; message: string } | null> {
    if (this.authQueue.length > 0) {
      return Promise.resolve(this.authQueue.shift()!)
    }
    return new Promise((resolve) => {
      this.authResolve = resolve
      this.authTimer = setTimeout(() => {
        this.authTimer = null
        this.authResolve = null
        resolve(null)
      }, AUTH_TIMEOUT)
    })
  }

  private async doAuth(callsign: string, password: string): Promise<void> {
    console.log('[ratflector] doAuth waiting for welcome...')
    const welcome = await this.waitForAuthLine()

    if (!welcome) {
      console.log('[ratflector] no welcome (timeout) - assuming connected')
      this.authenticated = true
      this.onStatus?.('connected', 'Connected (no auth)')
      return
    }

    console.log(`[ratflector] welcome code=${welcome.code} msg=${welcome.message}`)

    if (welcome.code === 100) {
      console.log('[ratflector] auth not required')
      this.authenticated = true
      this.onStatus?.('connected', 'Connected (no auth required)')
      return
    }

    if (welcome.code !== 101) {
      throw new Error(`Unexpected welcome code: ${welcome.code}`)
    }

    this.ws?.send(`USER ${callsign}\r\n`)
    const userResp = await this.waitForAuthLine()
    if (!userResp) {
      this.authenticated = true
      this.onStatus?.('connected', `Connected as ${callsign} (legacy)`)
      return
    }

    if (userResp.code === 200) {
      this.authenticated = true
      this.onStatus?.('connected', `Connected as ${callsign}`)
      return
    }

    if (userResp.code !== 102) {
      throw new Error(`Auth failed: code ${userResp.code} ${userResp.message}`)
    }

    this.ws?.send(`PASS ${password}\r\n`)
    const passResp = await this.waitForAuthLine()
    if (!passResp || passResp.code !== 200) {
      throw new Error(`Authentication failed: ${passResp?.message ?? 'no response'}`)
    }

    this.authenticated = true
    this.onStatus?.('connected', `Connected as ${callsign}`)
  }

  private parseFrames(): void {
    while (true) {
      const sobIdx = findSequence(this.buffer, ENCODED_HEADER)
      if (sobIdx === -1) break

      const eobIdx = findSequence(this.buffer, ENCODED_TRAILER, sobIdx + ENCODED_HEADER.length)
      if (eobIdx === -1) break

      const frameEnd = eobIdx + ENCODED_TRAILER.length
      const frameData = this.buffer.slice(sobIdx, frameEnd)
      this.buffer = this.buffer.slice(frameEnd)

      decodeFrame(frameData).then((frame) => {
        if (frame) {
          this.onFrame?.(frame)
        }
      })
    }
  }
}

function concat(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
}

function findSequence(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  if (needle.length === 0) return start
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return -1
}
