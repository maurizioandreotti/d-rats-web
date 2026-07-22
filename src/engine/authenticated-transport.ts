import { useConfigStore } from '../store/config-store'
import { useAuthStore } from '../store/auth-store'

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>
  close(): Promise<void>
}

export interface TransportConfig {
  baudRate: number
  dataBits: number
  parity: 'none' | 'even' | 'odd'
  flowControl?: boolean
}

export class AuthenticatedTransport {
  private serialPort: SerialPort | null = null
  private configStore = useConfigStore
  private authStore = useAuthStore

  async connect(port: SerialPort): Promise<void> {
    this.serialPort = port
    await this.setupFlowControl()
    await this.authenticate()
  }

  disconnect(): void {
    if (this.serialPort) {
      this.serialPort.close().catch(() => {})
      this.serialPort = null
    }
  }

  async authenticate(): Promise<boolean> {
    const state = this.authStore.getState()
    if (state.isAuthRequired && !state.isAuthenticated) {
      console.warn('[AuthenticatedTransport] Authentication required but not authenticated')
      return false
    }
    return true
  }

  setupFlowControl(): Promise<void> {
    const cfg = this.configStore.getState().config
    const serialPortConfig = cfg.ports.find(p => p.type === 'serial')?.serial
    console.log('[AuthenticatedTransport] Flow control:', serialPortConfig?.flowControl ?? 'none')
    return Promise.resolve()
  }

  sendFrame(frame: Uint8Array): void {
    if (!this.serialPort?.writable) return
    const writer = this.serialPort.writable.getWriter()
    writer.write(frame).then(() => writer.releaseLock())
  }

  onReceive(data: Uint8Array): void {
    console.log('[AuthenticatedTransport] Received', data.length, 'bytes')
  }
}
