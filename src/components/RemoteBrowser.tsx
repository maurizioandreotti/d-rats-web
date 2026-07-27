import { useState, useCallback, useEffect } from 'react'
import { useRpcStore } from '../store/rpc-store'
import { useEventStore } from '../store/event-store'
import type { RPCEngine } from '../engine/rpc'
import type { PortConfig } from '../types'

interface RemoteBrowserProps {
  rpcRef: React.MutableRefObject<RPCEngine | null>
  heardStations: string[]
  station: string
  onStationChange: (station: string) => void
  connectedPorts: PortConfig[]
  port: string
  onPortChange: (port: string) => void
}

// The wire format packs size and date into one string, e.g.
// "52.0 KB (01:53:01 2012-09-26)" — split it back apart for display only.
function splitInfo(info: string): { size: string; date: string } {
  const match = info.match(/^(.*?)\s*\((.*)\)\s*$/)
  return match ? { size: match[1]!, date: match[2]! } : { size: info, date: '' }
}

export function RemoteBrowser({
  rpcRef,
  heardStations,
  station,
  onStationChange,
  connectedPorts,
  port,
  onPortChange,
}: RemoteBrowserProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null)

  const listings = useRpcStore((s) => s.listings)
  const setConnecting = useRpcStore((s) => s.setConnecting)
  const setConnected = useRpcStore((s) => s.setConnected)
  const setError = useRpcStore((s) => s.setError)
  const setDisconnected = useRpcStore((s) => s.setDisconnected)
  const listing = station ? listings[station] : undefined
  const isConnected = listing?.status === 'connected'

  useEffect(() => {
    setSelectedFile(null)
  }, [station])

  const handleConnect = useCallback(async () => {
    if (!station || !rpcRef.current) return
    setConnecting(station)
    try {
      const files = await rpcRef.current.listFiles(station, port || undefined)
      setConnected(station, files)
    } catch (err) {
      setError(station, err instanceof Error ? err.message : String(err))
    }
  }, [station, port, rpcRef, setConnecting, setConnected, setError])

  const handleDisconnect = useCallback(() => {
    if (!station) return
    setDisconnected(station)
    setSelectedFile(null)
  }, [station, setDisconnected])

  const handleDownload = useCallback(async () => {
    if (!station || !selectedFile || !rpcRef.current) return
    setBusy('download')
    try {
      const result = await rpcRef.current.pullFile(station, selectedFile, port || undefined)
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: result.ok
          ? `[RPC] Download "${selectedFile}" from ${station} accepted — incoming transfer will appear in Transfers above`
          : `[RPC] Download "${selectedFile}" from ${station} failed: ${result.message}`,
        type: 'frame',
      })
    } catch (err) {
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[RPC] Download "${selectedFile}" from ${station} failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'frame',
      })
    } finally {
      setBusy(null)
    }
  }, [station, selectedFile, port, rpcRef])

  const handleDelete = useCallback(async () => {
    if (!station || !selectedFile || !rpcRef.current) return
    const password = window.prompt(`Password to delete "${selectedFile}" on ${station}:`)
    if (password === null) return

    setBusy('delete')
    try {
      const result = await rpcRef.current.deleteFile(station, selectedFile, password, port || undefined)
      if (result.ok) {
        setSelectedFile(null)
        const files = await rpcRef.current.listFiles(station, port || undefined)
        setConnected(station, files)
      } else {
        useEventStore.getState().addEvent({
          time: Date.now(),
          text: `[RPC] Delete "${selectedFile}" on ${station} failed: ${result.message}`,
          type: 'frame',
        })
      }
    } finally {
      setBusy(null)
    }
  }, [station, selectedFile, port, rpcRef, setConnected])

  return (
    <div className="file-pane">
      <div className="file-pane-header file-pane-header-wrap">
        <h3>Remote</h3>
        <select value={station} onChange={(e) => onStationChange(e.target.value)}>
          <option value="">-- Station --</option>
          {heardStations.map((call) => (
            <option key={call} value={call}>{call}</option>
          ))}
        </select>
        {connectedPorts.length > 0 && (
          <select value={port} onChange={(e) => onPortChange(e.target.value)}>
            {connectedPorts.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        )}
        <div className="file-pane-toolbar">
          <button className="btn btn-sm btn-primary" onClick={handleConnect} disabled={!station || listing?.status === 'connecting'}>
            {listing?.status === 'connecting' ? 'Connecting…' : isConnected ? 'Refresh' : 'Connect'}
          </button>
          <button className="btn btn-sm" onClick={handleDisconnect} disabled={!isConnected}>
            Disconnect
          </button>
          <button className="btn btn-sm" onClick={handleDownload} disabled={!isConnected || !selectedFile || busy !== null}>
            {busy === 'download' ? 'Downloading…' : 'Download'}
          </button>
          <button className="btn btn-sm btn-danger-outline" onClick={handleDelete} disabled={!isConnected || !selectedFile || busy !== null}>
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {heardStations.length === 0 && (
        <p className="empty-state">No stations heard yet — a station must be heard before you can browse its files.</p>
      )}
      {listing?.status === 'error' && <p className="empty-state">{listing.error}</p>}
      {isConnected && listing.files.length === 0 && (
        <p className="empty-state">{station} has no shared files.</p>
      )}

      {isConnected && listing.files.length > 0 && (
        <table className="file-table">
          <thead>
            <tr>
              <th></th>
              <th>Filename</th>
              <th>Size</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {listing.files.map((f) => {
              const { size, date } = splitInfo(f.info)
              return (
                <tr key={f.name} className={selectedFile === f.name ? 'selected' : ''} onClick={() => setSelectedFile(f.name)}>
                  <td><input type="radio" checked={selectedFile === f.name} onChange={() => setSelectedFile(f.name)} onClick={(e) => e.stopPropagation()} /></td>
                  <td>{f.name}</td>
                  <td>{size}</td>
                  <td>{date}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
