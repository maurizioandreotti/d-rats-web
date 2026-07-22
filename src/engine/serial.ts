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

interface SerialOutputSignals {
  dataTerminalReady?: boolean
  requestToSend?: boolean
  break?: boolean
}

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array<ArrayBuffer>> | null
  readonly writable: WritableStream<Uint8Array<ArrayBuffer>> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  setSignals(signals: SerialOutputSignals): Promise<void>
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
  static onSniffCallbacks: Array<(direction: 'rx' | 'tx', data: Uint8Array) => void> = []

  static addSniffListener(cb: (direction: 'rx' | 'tx', data: Uint8Array) => void): void {
    RadioSerial.onSniffCallbacks.push(cb)
  }

  static removeSniffListener(cb: (direction: 'rx' | 'tx', data: Uint8Array) => void): void {
    RadioSerial.onSniffCallbacks = RadioSerial.onSniffCallbacks.filter(c => c !== cb)
  }

  static clearSniffListeners(): void {
    RadioSerial.onSniffCallbacks = []
  }

  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>> | null = null

  private onDataCallbacks: Array<(data: Uint8Array) => void> = []
  private onDisconnect: (() => void) | null = null

  addDataCallback(cb: (data: Uint8Array) => void): void {
    this.onDataCallbacks.push(cb)
  }

  removeDataCallback(cb: (data: Uint8Array) => void): void {
    this.onDataCallbacks = this.onDataCallbacks.filter(c => c !== cb)
  }

  private xonState = true
  private xoffTimeoutMs = 15000
  private readLoopActive = false
  private closed = false
  private disconnectNotified = false

  setOnData(cb: (data: Uint8Array) => void): void {
    // Replace all (keeps existing behavior for callers that use setOnData)
    this.onDataCallbacks = [cb]
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

    if (port.readable || port.writable) {
      try {
        const oldReader = port.readable?.getReader()
        oldReader?.cancel()
        oldReader?.releaseLock()
      } catch { /* ignore */ }
      try {
        const oldWriter = port.writable?.getWriter()
        await oldWriter?.close()
        oldWriter?.releaseLock()
      } catch { /* ignore */ }
      try { await port.close() } catch { /* ignore */ }
    }

    await port.open({
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      flowControl: 'none',
    })

    this.port = port

    // Set DTR and RTS — many ICOM USB cables need these for power.
    // Retry a few times because some USB-serial drivers are flaky.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await port.setSignals({ dataTerminalReady: true, requestToSend: true })
        console.log('[RadioSerial] setSignals(DTR=1, RTS=1) OK on attempt', attempt + 1)
        break
      } catch (err) {
        console.warn('[RadioSerial] setSignals() attempt', attempt + 1, 'failed:', err)
        await sleep(200)
      }
    }

    // Verify DTR/RTS state by reading back (not supported by all browsers)
    try {
      await port.setSignals({ dataTerminalReady: true })
      console.log('[RadioSerial] DTR re-verified')
    } catch { /* ignore */ }

    port.addEventListener('disconnect', () => {
      if (!this.disconnectNotified) {
        this.disconnectNotified = true
        this.onDisconnect?.()
      }
    })

    if (!port.writable || !port.readable) {
      throw new Error('Serial port opened but readable/writable streams not available')
    }

    this.writer = port.writable.getWriter()
    this.reader = port.readable.getReader()

    console.log('[RadioSerial] Connection established, starting read loop')
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
      console.error('[RadioSerial] send() failed: not connected')
      throw new Error('Serial port not connected')
    }

    console.log('[RadioSerial] send() called with', data.length, 'bytes')
    const chunk = 8
    for (let pos = 0; pos < data.length; pos += chunk) {
      const end = Math.min(pos + chunk, data.length)
      const slice = data.subarray(pos, end)

      for (const cb of RadioSerial.onSniffCallbacks) cb('tx', slice)

      try {
        await this.writer.write(slice as Uint8Array<ArrayBuffer>)
      } catch (err) {
        console.error('[RadioSerial] write() error at pos', pos, ':', err)
        throw err
      }

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
    console.log('[RadioSerial] send() completed')
  }

  private startReadLoop(): void {
    if (this.readLoopActive) return
    this.readLoopActive = true

    console.log('[RadioSerial] Read loop started')

    const loop = async () => {
      console.log('[RadioSerial] Reader:', !!this.reader, 'Closed:', this.closed)

      // Poll: some Chrome versions need delay before readable is ready
      if (!this.reader && this.port) {
        for (let i = 0; i < 50; i++) {
          await sleep(100)
          if (this.port.readable) {
            this.reader = this.port.readable.getReader()
            console.log('[RadioSerial] Reader obtained after poll')
            break
          }
        }
      }

      while (!this.closed && this.reader) {
        try {
          const { value, done } = await this.reader.read()
          if (done) {
            console.log('[RadioSerial] Reader done')
            break
          }
          if (!value) {
            console.log('[RadioSerial] Empty read')
            continue
          }

          console.log('[RadioSerial] Read', value.length, 'bytes:', Array.from(value.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '))

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

          for (const cb of RadioSerial.onSniffCallbacks) cb('rx', value)

          if (filtered.length > 0) {
            const filteredArr = new Uint8Array(filtered)
            for (const cb of this.onDataCallbacks) {
              cb(filteredArr)
            }
          }
        } catch (err) {
          console.log('[RadioSerial] Read error:', err)
          if (!this.closed) {
            if (!this.disconnectNotified) {
              this.disconnectNotified = true
              this.onDisconnect?.()
            }
          }
          break
        }
      }
      console.log('[RadioSerial] Read loop ended')
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
