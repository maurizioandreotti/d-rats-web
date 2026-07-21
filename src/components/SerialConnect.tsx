import { useState, useCallback } from 'react'
import { RadioSerial } from '../engine/serial'
import type { RadioSerialConfig } from '../engine/serial'
import { useConfigStore } from '../store/config-store'

interface SerialConnectProps {
  serial: { current: RadioSerial | null }
  onConnected?: () => void
  onDisconnected?: () => void
}

export function SerialConnect({ serial, onConnected, onDisconnected }: SerialConnectProps) {
  const { config, updateConfig } = useConfigStore()
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState('Not connected')
  const [portInfo, setPortInfo] = useState<{ usbVendorId?: number; usbProductId?: number } | null>(null)
  const [baudRate, setBaudRate] = useState(config.serial.baudRate)

  const handleConnect = useCallback(async () => {
    try {
      setConnecting(true)
      setStatus('Requesting serial port...')

      const port = await RadioSerial.requestPort()
      const instance = new RadioSerial()

      instance.setOnDisconnect(() => {
        setConnected(false)
        setStatus('Disconnected')
        setPortInfo(null)
        onDisconnected?.()
      })

      const serialConfig: RadioSerialConfig = {
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      }

      await instance.connect(port, serialConfig)

      serial.current = instance
      setConnected(true)
      setStatus(`Connected at ${baudRate} baud`)
      setPortInfo(port.getInfo())
      updateConfig({ serial: { ...config.serial, baudRate } })
      onConnected?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setStatus(`Error: ${message}`)
    } finally {
      setConnecting(false)
    }
  }, [baudRate, serial, config.serial, updateConfig, onConnected, onDisconnected])

  const handleDisconnect = useCallback(async () => {
    const instance = serial.current
    if (instance) {
      await instance.disconnect()
      serial.current = null
    }
    setConnected(false)
    setStatus('Disconnected')
    setPortInfo(null)
    onDisconnected?.()
  }, [serial, onDisconnected])

  return (
    <div>
      <h2>Radio Connection</h2>

      <div className="panel-card">
        <h3>Serial Port</h3>
        <div className="form-row">
          <label htmlFor="baud">Baud Rate</label>
          <select
            id="baud"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={connecting || connected}
          >
            <option value="4800">4800</option>
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
            <option value="57600">57600</option>
            <option value="115200">115200</option>
          </select>
        </div>

        <div className="status-indicator">
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span className="status-text">{status}</span>
        </div>

        {portInfo && (
          <div className="port-details">
            <p>USB Vendor ID: 0x{portInfo.usbVendorId?.toString(16).padStart(4, '0') ?? 'N/A'}</p>
            <p>USB Product ID: 0x{portInfo.usbProductId?.toString(16).padStart(4, '0') ?? 'N/A'}</p>
          </div>
        )}

        <div className="button-row">
          {!connected ? (
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect to Radio'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="panel-card">
        <h3>How to Connect</h3>
        <ol>
          <li>Connect your ICOM D-STAR radio to USB via the data dongle</li>
          <li>Select the correct baud rate (typically 9600 for direct radio)</li>
          <li>Click "Connect to Radio" and select the serial port in the browser dialog</li>
          <li>Once connected, use the Chat, Map, and Files tabs</li>
        </ol>
        <p className="note">
          Note: Web Serial API requires Chrome or Edge. The browser will prompt you to
          select the serial port.
        </p>
      </div>
    </div>
  )
}
