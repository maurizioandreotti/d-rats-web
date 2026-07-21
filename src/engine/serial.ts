export const XON = 0x11
export const XOFF = 0x13

export interface RadioSerialConfig {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd'
}

interface SerialPortRequestOptions {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>
}

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: 'none' | 'even' | 'odd'
  flowControl?: 'none' | 'hardware'
  bufferSize?: number
}

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array<ArrayBuffer>> | null
  readonly writable: WritableStream<Uint8Array<ArrayBuffer>> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  addEventListener(type: 'disconnect', listener: (event: Event) => void): void
  removeEventListener(type: 'disconnect', listener: (event: Event) => void): void
}

interface NavigatorSerial {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
}

export function getSerialApi(): NavigatorSerial | undefined {
  const nav = navigator as Navigator & { serial?: NavigatorSerial }
  return nav.serial
}

export class RadioSerial {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>> | null = null

  private onData: ((data: Uint8Array) => void) | null = null
  private onDisconnect: (() => void) | null = null

  private xonState = true
  private xoffTimeoutMs = 15000
  private readLoopActive = false
  private closed = false
  private disconnectNotified = false

  setOnData(cb: (data: Uint8Array) => void): void {
    this.onData = cb
  }

  setOnDisconnect(cb: () => void): void {
    this.onDisconnect = cb
  }

  static async requestPort(): Promise<SerialPort> {
    const api = getSerialApi()
    if (!api) {
      throw new Error('Web Serial API not available. Use Chrome or Edge.')
    }
    return api.requestPort()
  }

  static async getKnownPorts(): Promise<SerialPort[]> {
    const api = getSerialApi()
    if (!api) return []
    return api.getPorts()
  }

  async connect(port: SerialPort, config: RadioSerialConfig): Promise<void> {
    this.closed = false
    this.disconnectNotified = false

    await port.open({
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      flowControl: 'none',
    })

    this.port = port
    port.addEventListener('disconnect', () => {
      if (!this.disconnectNotified) {
        this.disconnectNotified = true
        this.onDisconnect?.()
      }
    })

    this.writer = port.writable!.getWriter()
    this.reader = port.readable!.getReader()

    this.startReadLoop()
  }

  async disconnect(): Promise<void> {
    this.closed = true
    this.xonState = true

    try { this.reader?.cancel() } catch { /* ignore */ }
    this.reader = null

    try { this.writer?.close() } catch { /* ignore */ }
    this.writer = null

    try { if (this.port) await this.port.close() } catch { /* ignore */ }
    this.port = null
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.writer || this.closed) {
      throw new Error('Serial port not connected')
    }

    const chunk = 8
    for (let pos = 0; pos < data.length; pos += chunk) {
      const end = Math.min(pos + chunk, data.length)
      const slice = data.subarray(pos, end)

      await this.writer.write(slice as Uint8Array<ArrayBuffer>)

      const waitStart = Date.now()
      while (!this.xonState) {
        if (Date.now() - waitStart > this.xoffTimeoutMs) {
          this.xonState = true
          break
        }
        await sleep(10)
      }

      if (this.closed) {
        throw new Error('Serial port disconnected during write')
      }
    }
  }

  private startReadLoop(): void {
    if (this.readLoopActive) return
    this.readLoopActive = true

    const loop = async () => {
      while (!this.closed && this.reader) {
        try {
          const { value, done } = await this.reader.read()
          if (done) break
          if (!value) continue

          const filtered: number[] = []
          for (const byte of value) {
            if (byte === XOFF) {
              this.xonState = false
            } else if (byte === XON) {
              this.xonState = true
            } else {
              filtered.push(byte)
            }
          }

          if (filtered.length > 0 && this.onData) {
            this.onData(new Uint8Array(filtered))
          }
        } catch {
          if (!this.closed) {
            if (!this.disconnectNotified) {
              this.disconnectNotified = true
              this.onDisconnect?.()
            }
          }
          break
        }
      }
      this.readLoopActive = false
    }

    loop()
  }

  get isConnected(): boolean {
    return this.port !== null && !this.closed
  }

  get portInfo(): { usbVendorId?: number; usbProductId?: number } | null {
    if (!this.port) return null
    return this.port.getInfo()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
