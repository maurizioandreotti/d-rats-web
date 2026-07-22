import { useState, useCallback, useEffect, useRef } from 'react'
import { useConfigStore } from '../store/config-store'
import { useRatflectorStore } from '../store/ratflector-store'
import { RatflectorConnection } from '../engine/ratflector'
import type { DDT2Frame } from '../types'

interface RatflectorPanelProps {
  connectionRef: React.MutableRefObject<RatflectorConnection | null>
  onFrame?: (frame: DDT2Frame) => void
}

export function RatflectorPanel({ connectionRef, onFrame }: RatflectorPanelProps) {
  const { config, updateConfig } = useConfigStore()
  const { status, statusMessage } = useRatflectorStore()
  const setStatus = useRatflectorStore((s) => s.setStatus)
  const defaultRatflector = config.ports.find(p => p.type === 'ratflector')?.ratflector
  const [host, setHost] = useState(defaultRatflector?.host ?? 'ref.d-rats.com')
  const [port, setPort] = useState((defaultRatflector?.port ?? 9000).toString())
  const [callsign, setCallsign] = useState(defaultRatflector?.callsign ?? '')
  const [password, setPassword] = useState(defaultRatflector?.password ?? '')
  const [connecting, setConnecting] = useState(false)
  const connRef = useRef<RatflectorConnection | null>(null)

  useEffect(() => {
    if (connRef.current) {
      connectionRef.current = connRef.current
    }
  }, [connectionRef])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      const conn = new RatflectorConnection()
      connRef.current = conn
      connectionRef.current = conn

      conn.setOnStatus((st, msg) => {
        setStatus(st, msg)
        if (st !== 'connecting') setConnecting(false)
      })

      conn.setOnFrame((frame) => {
        onFrame?.(frame)
      })

      const ratIdx = config.ports.findIndex(p => p.type === 'ratflector')
      if (ratIdx >= 0) {
        const portNum = parseInt(port, 10)
        const store = useConfigStore.getState()
        store.updatePort(ratIdx, {
          ratflector: { host, port: isNaN(portNum) ? 9000 : portNum, callsign, password },
        })
      }

      await conn.connect(host, parseInt(port, 10), callsign, password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setStatus('error', msg)
      setConnecting(false)
    }
  }, [host, port, callsign, password, updateConfig, defaultRatflector, connectionRef, onFrame, setStatus])

  const handleDisconnect = useCallback(() => {
    connRef.current?.disconnect()
    connRef.current = null
    connectionRef.current = null
    setStatus('disconnected', 'Disconnected')
  }, [connectionRef, setStatus])

  const isConnected = status === 'connected'

  return (
    <div>
      <h2>Ratflector</h2>
      <div className="panel-card">
        <h3>Connection</h3>
        <div className="form-row">
          <label htmlFor="rf-host">Host</label>
          <input
            id="rf-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={connecting || isConnected}
          />
        </div>
        <div className="form-row">
          <label htmlFor="rf-port">Port</label>
          <input
            id="rf-port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={connecting || isConnected}
          />
        </div>
        <div className="form-row">
          <label htmlFor="rf-call">Callsign</label>
          <input
            id="rf-call"
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            disabled={connecting || isConnected}
          />
        </div>
        <div className="form-row">
          <label htmlFor="rf-pass">Password</label>
          <input
            id="rf-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connecting || isConnected}
          />
        </div>

        <div className="status-indicator">
          <span className={`status-dot ${status === 'connected' ? 'online' : status === 'connecting' ? 'warning' : 'offline'}`} />
          <span className="status-text">{statusMessage || status}</span>
        </div>

        <div className="button-row">
          {!isConnected ? (
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
