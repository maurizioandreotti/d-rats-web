import { useState, useCallback, useEffect } from 'react'
import { useConfigStore } from '../store/config-store'
import { usePortStore } from '../store/port-store'
import { useRatflectorListStore } from '../store/ratflector-list-store'
import type { PortConfig } from '../types'

interface SerialConnectProps {
  onConnect: (name: string, config: PortConfig) => Promise<void>
  onDisconnect: (name: string) => Promise<void>
  onPortSelected: (name: string) => void
}

export function SerialConnect({ onConnect, onDisconnect, onPortSelected }: SerialConnectProps) {
  const { config, updatePort, addPort, removePort } = useConfigStore()
  const portStatuses = usePortStore((s) => s.statuses)
  const portMessages = usePortStore((s) => s.messages)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [activePort, setActivePort] = useState<string>('')
  const [showAdd, setShowAdd] = useState(false)
  const [newType, setNewType] = useState<'serial' | 'ratflector'>('serial')
  const [newName, setNewName] = useState('')
  const [newHost, setNewHost] = useState('ref.d-rats.com')
  const [newPort, setNewPort] = useState('9000')
  const [newPass, setNewPass] = useState('')
  const [newBaud, setNewBaud] = useState('9600')
  const [newServerName, setNewServerName] = useState('')
  const [newBridgeUrl, setNewBridgeUrl] = useState('ws://localhost:9001')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const ratflectorServers = useRatflectorListStore((s) => s.servers)
  const rfLoading = useRatflectorListStore((s) => s.loading)
  const rfError = useRatflectorListStore((s) => s.error)
  const fetchServers = useRatflectorListStore((s) => s.fetchServers)

  useEffect(() => {
    if (showAdd && newType === 'ratflector' && ratflectorServers.length === 0 && !rfLoading && !rfError) {
      fetchServers()
    }
  }, [showAdd, newType, ratflectorServers.length, rfLoading, rfError, fetchServers])

  const handleServerSelect = useCallback((name: string) => {
    setNewServerName(name)
    const server = ratflectorServers.find(s => s.name === name)
    if (server) {
      setNewHost(server.hostname)
      setNewPort(String(server.port))
    }
  }, [ratflectorServers])

  const handleConnect = useCallback(
    async (port: PortConfig, index: number) => {
      setConnecting(port.name)
      try {
        await onConnect(port.name, port)
        updatePort(index, { enabled: true })
        setActivePort(port.name)
        onPortSelected(port.name)
      } catch {
        // error already set in store by engine
      } finally {
        setConnecting(null)
      }
    },
    [onConnect, updatePort, onPortSelected],
  )

  const handleDisconnect = useCallback(
    async (name: string) => {
      await onDisconnect(name)
      if (activePort === name) {
        setActivePort('')
        onPortSelected('')
      }
    },
    [onDisconnect, activePort, onPortSelected],
  )

  const handleSetActive = useCallback(
    (name: string) => {
      setActivePort(name)
      onPortSelected(name)
    },
    [onPortSelected],
  )

  const handleDelete = useCallback(
    async (name: string, index: number) => {
      if (portStatuses[name] === 'connected') {
        await onDisconnect(name)
      }
      removePort(index)
      if (activePort === name) {
        setActivePort('')
        onPortSelected('')
      }
    },
    [onDisconnect, removePort, activePort, onPortSelected, portStatuses],
  )

  const handleEdit = useCallback((index: number) => {
    const port = config.ports[index]
    if (!port) return
    setEditingIndex(index)
    setNewType(port.type)
    setNewName(port.name)
    setNewBaud(port.type === 'serial' ? port.settings : '9600')
    setNewHost(port.ratflector?.host ?? 'ref.d-rats.com')
    setNewPort(String(port.ratflector?.port ?? 9000))
    setNewPass(port.ratflector?.password ?? '')
    setNewBridgeUrl(port.ratflector?.bridgeUrl ?? 'ws://localhost:9001')
    setNewServerName('')
    setShowAdd(true)
  }, [config.ports])

  const handleAddPort = useCallback(() => {
    if (!newName) return

    const port: PortConfig = {
      enabled: editingIndex === null ? true : config.ports[editingIndex]?.enabled ?? true,
      type: newType,
      settings: newType === 'serial' ? newBaud : newPass,
      sniff: false,
      raw: false,
      name: newName,
    }

    if (newType === 'serial') {
      port.serial = {
        baudRate: parseInt(newBaud, 10),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'xon/xoff',
      }
    } else {
      port.ratflector = {
        host: newHost,
        port: parseInt(newPort, 10),
        callsign: config.myCallsign,
        password: newPass,
        bridgeUrl: newBridgeUrl || undefined,
      }
    }

    if (editingIndex !== null) {
      updatePort(editingIndex, port)
    } else {
      addPort(port)
    }
    cancelForm()
  }, [newType, newName, newBaud, newHost, newPort, newPass, newBridgeUrl, config.myCallsign, config.ports, editingIndex, addPort, updatePort])

  const cancelForm = useCallback(() => {
    setShowAdd(false)
    setEditingIndex(null)
    setNewName('')
    setNewPass('')
  }, [])

  return (
    <div>
      <h2>Ports</h2>

      <div className="port-list">
        {config.ports.map((port, i) => {
          const status = portStatuses[port.name] ?? 'disconnected'
          const msg = portMessages[port.name] ?? ''
          const isConnecting = connecting === port.name
          const isConnected = status === 'connected'
          const isActive = activePort === port.name

          return (
            <div key={i} className={`port-card ${isActive ? 'active' : ''}`}>
              <div className="port-header">
                <span className="port-type-badge">{port.type === 'ratflector' ? 'RAT' : 'SER'}</span>
                <span className={`status-dot ${status === 'connected' ? 'online' : status === 'connecting' ? 'warning' : status === 'error' ? 'offline' : 'unknown'}`} />
                <strong className="port-name">{port.name}</strong>
                <span className="port-settings">
                  {port.type === 'serial' ? `${port.settings} baud` : port.ratflector ? `${port.ratflector.host}:${port.ratflector.port}` : ''}
                </span>
              </div>
              <div className="port-status-text">
                {isConnected
                  ? `Connected${port.type === 'serial' ? ` at ${port.settings} baud` : ` to ${port.ratflector?.host}:${port.ratflector?.port}`}`
                  : msg || (status === 'disconnected' ? (port.type === 'ratflector' ? 'Run: python3 ratflector-bridge.py' : 'Not connected') : status)}
              </div>
              {port.type === 'serial' && port.serial && !isConnected && (
                <div className="port-serial-config">
                  <select
                    value={port.serial.baudRate}
                    onChange={(e) => updatePort(i, { serial: { ...port.serial!, baudRate: Number(e.target.value) }, settings: e.target.value })}
                    disabled={isConnecting}
                  >
                    {[4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="port-actions">
                {!isConnected ? (
                  <button className="btn btn-sm btn-primary" onClick={() => handleConnect(port, i)} disabled={isConnecting}>
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => handleSetActive(port.name)} disabled={isActive}>
                      {isActive ? 'Active' : 'Use'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDisconnect(port.name)}>
                      Disconnect
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-danger-outline" onClick={() => handleDelete(port.name, i)}>
                  Delete
                </button>
                <button className="btn btn-sm" onClick={() => handleEdit(i)}>
                  Edit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <div className="panel-card">
          <h3>{editingIndex !== null ? 'Edit Port' : 'Add Port'}</h3>
          <div className="form-row">
            <label>Type</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value as 'serial' | 'ratflector')}>
              <option value="serial">Serial</option>
              <option value="ratflector">Ratflector</option>
            </select>
          </div>
          <div className="form-row">
            <label>Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Radio, RAT" />
          </div>
          {newType === 'serial' ? (
            <div className="form-row">
              <label>Baud Rate</label>
              <select value={newBaud} onChange={(e) => setNewBaud(e.target.value)}>
                {[4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="form-row">
                <label>Server</label>
                <select value={newServerName} onChange={(e) => handleServerSelect(e.target.value)}>
                  <option value="">-- Custom --</option>
                  {rfError ? (
                    <option value="" disabled>Failed to load</option>
                  ) : rfLoading ? (
                    <option value="" disabled>Loading...</option>
                  ) : (
                    ratflectorServers.map(s => (
                      <option key={s.name} value={s.name}>
                        {s.name} — {s.description}
                      </option>
                    ))
                  )}
                </select>
                {rfError && (
                  <button className="btn btn-xs" onClick={fetchServers} title="Retry">
                    Retry
                  </button>
                )}
              </div>
              <div className="form-row">
                <label>Host</label>
                <input value={newHost} onChange={(e) => setNewHost(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Port</label>
                <input value={newPort} onChange={(e) => setNewPort(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Password</label>
                <input value={newPass} type="password" onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Bridge URL</label>
                <input value={newBridgeUrl} onChange={(e) => setNewBridgeUrl(e.target.value)} placeholder="ws://localhost:9001" />
              </div>
              <p className="help-text">
                Ratflector uses raw TCP — run <code>python3 ratflector-bridge.py</code> locally
              </p>
            </>
          )}
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleAddPort}>{editingIndex !== null ? 'Save' : 'Add'}</button>
            <button className="btn" onClick={cancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button className="btn btn-sm" onClick={() => { setShowAdd(true); setEditingIndex(null); setNewName(''); setNewPass(''); }}>+ Add Port</button>
      )}
    </div>
  )
}
