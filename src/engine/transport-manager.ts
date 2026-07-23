import { RadioSerial } from './serial'
import { Transport } from './transport'
import { RatflectorConnection } from './ratflector'
import { parseIcomGps } from './gps'
import type { DDT2Frame, PortConfig } from '../types'
import { usePortStore } from '../store/port-store'
import { useStationStore } from '../store/station-store'

export type FrameHandler = (frame: DDT2Frame, portName: string) => void

export class TransportManager {
  private serialTransports = new Map<string, { serial: RadioSerial; transport: Transport }>()
  private ratflectorTransports = new Map<string, RatflectorConnection>()
  private onFrame: FrameHandler | null = null

  setOnFrame(handler: FrameHandler): void {
    this.onFrame = handler
  }

  private handleRawGps(text: string, portName: string): void {
    const parsed = parseIcomGps(text)
    if (!parsed) return

    useStationStore.getState().updateStation(parsed.callsign, {
      lastHeard: Date.now(),
    })

    if (parsed.position) {
      useStationStore.getState().setStationPosition(parsed.callsign, parsed.position)
    }

    if (this.onFrame) {
      const frame: DDT2Frame = {
        header: {
          magic: 0x22,
          seq: 0,
          sessionId: 1,
          type: 0,
          checksum: 0,
          length: text.length,
          sourceStation: parsed.callsign,
          destStation: 'CQCQCQ',
        },
        data: new TextEncoder().encode(text),
      }
      this.onFrame(frame, portName)
    }
  }

  private handleRawText(text: string, portName: string): void {
    const callMatch = text.match(/([A-Z]{1,2}\d[A-Z]{1,3})(?:-\d{1,2})?/)
    if (!callMatch) return

    const callsign = callMatch[1]!
    useStationStore.getState().updateStation(callsign, {
      lastHeard: Date.now(),
    })

    if (this.onFrame) {
      const frame: DDT2Frame = {
        header: {
          magic: 0x22,
          seq: 0,
          sessionId: 1,
          type: 0,
          checksum: 0,
          length: text.length,
          sourceStation: callsign,
          destStation: 'CQCQCQ',
        },
        data: new TextEncoder().encode(text),
      }
      this.onFrame(frame, portName)
    }
  }

  get connectedPorts(): string[] {
    return [...this.serialTransports.keys(), ...this.ratflectorTransports.keys()]
  }

  isConnected(name: string): boolean {
    return this.serialTransports.has(name) || this.ratflectorTransports.has(name)
  }

  getConnection(name: string): RadioSerial | RatflectorConnection | undefined {
    const st = this.serialTransports.get(name)
    if (st) return st.serial
    return this.ratflectorTransports.get(name)
  }

  async connectSerial(name: string, config: PortConfig): Promise<void> {
    const setStatus = usePortStore.getState().setStatus
    setStatus(name, 'connecting', `Opening ${name}...`)

    try {
      const port = await RadioSerial.requestPort()
      const serial = new RadioSerial()
      const transport = new Transport(serial)

      transport.setOnFrame((frame) => this.onFrame?.(frame, name))
      transport.setOnGpsString((text) => this.handleRawGps(text, name))
      transport.setOnRawText((text) => this.handleRawText(text, name))

      const baudRate = config.serial?.baudRate ?? 9600
      await serial.connect(port, {
        baudRate,
        dataBits: config.serial?.dataBits ?? 8,
        stopBits: config.serial?.stopBits ?? 1,
        parity: config.serial?.parity ?? 'none',
      })

      // Send warmup frame to wake radio from power-save (type 254, session 0, uncompressed)
      const warmupFrame: DDT2Frame = {
        header: {
          magic: 0x22,
          seq: 0,
          sessionId: 0,
          type: 254,
          checksum: 0,
          length: 16,
          sourceStation: '!',
          destStation: '!',
        },
        data: new Uint8Array(16).fill(0x01),
      }
      await transport.sendFrame(warmupFrame, false)
      console.log('[TransportManager] Warmup frame sent')

      this.serialTransports.set(name, { serial, transport })
      setStatus(name, 'connected', `Connected at ${baudRate} baud`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setStatus(name, 'error', msg)
      throw err
    }
  }

  async connectRatflector(name: string, config: PortConfig): Promise<void> {
    const setStatus = usePortStore.getState().setStatus
    const rf = config.ratflector
    if (!rf) throw new Error('Missing ratflector config')

    setStatus(name, 'connecting', `Connecting to ${rf.host}:${rf.port}...`)

    try {
      const conn = new RatflectorConnection()
      conn.setOnFrame((frame) => this.onFrame?.(frame, name))
      conn.setOnStatus((status, msg) => setStatus(name, status, msg))

      await conn.connect(rf.host, rf.port, rf.callsign, rf.password, rf.bridgeUrl)
      this.ratflectorTransports.set(name, conn)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setStatus(name, 'error', msg)
      throw err
    }
  }

  async disconnect(name: string): Promise<void> {
    const st = this.serialTransports.get(name)
    if (st) {
      await st.serial.disconnect()
      this.serialTransports.delete(name)
    }

    const rf = this.ratflectorTransports.get(name)
    if (rf) {
      rf.disconnect()
      this.ratflectorTransports.delete(name)
    }

    usePortStore.getState().setStatus(name, 'disconnected', 'Disconnected')
  }

  disconnectAll(): void {
    for (const name of this.serialTransports.keys()) {
      this.serialTransports.get(name)?.serial.disconnect()
    }
    for (const name of this.ratflectorTransports.keys()) {
      this.ratflectorTransports.get(name)?.disconnect()
    }
    this.serialTransports.clear()
    this.ratflectorTransports.clear()
  }

  async sendFrame(frame: DDT2Frame, portName?: string): Promise<void> {
    if (portName) {
      const st = this.serialTransports.get(portName)
      if (st) {
        await st.transport.sendFrame(frame)
        return
      }
      const rf = this.ratflectorTransports.get(portName)
      if (rf) {
        await rf.sendFrame(frame)
        return
      }
      throw new Error(`Port "${portName}" not connected`)
    }

    // Fallback: first available connected port
    for (const st of this.serialTransports.values()) {
      await st.transport.sendFrame(frame)
      return
    }
    for (const rf of this.ratflectorTransports.values()) {
      await rf.sendFrame(frame)
      return
    }
    throw new Error('No connected port')
  }
}
