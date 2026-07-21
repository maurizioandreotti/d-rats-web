export const DDT2_SOB = new Uint8Array([0x5b, 0x53, 0x4f, 0x42]) // "[SOB]"
export const DDT2_EOB = new Uint8Array([0x5b, 0x45, 0x4f, 0x42]) // "[EOB]"

export const XON = 0x11
export const XOFF = 0x13

export interface RadioSerialConfig {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd'
  flowControl: 'xon/xoff' | 'none'
}

export class RadioSerial {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readBuffer: Uint8Array[] = []
  private onFrame: ((data: Uint8Array) => void) | null = null
  private onDisconnect: (() => void) | null = null

  setOnFrame(cb: (data: Uint8Array) => void): void {
    this.onFrame = cb
  }

  setOnDisconnect(cb: () => void): void {
    this.onDisconnect = cb
  }

  async connect(config: RadioSerialConfig): Promise<void> {
    // TODO: implement Web Serial connection with XON/XOFF flow control
    throw new Error('Not implemented')
  }

  async disconnect(): Promise<void> {
    // TODO: implement disconnect
    throw new Error('Not implemented')
  }

  async send(data: Uint8Array): Promise<void> {
    // TODO: implement chunked writes with XON/XOFF flow control
    throw new Error('Not implemented')
  }

  get isConnected(): boolean {
    return this.port !== null && this.port.readable !== null
  }
}
