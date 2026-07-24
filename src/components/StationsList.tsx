import { useCallback, useRef, useState, useEffect } from 'react'
import { useStationStore } from '../store/station-store'
import { usePingStore } from '../store/ping-store'
import { usePortStore } from '../store/port-store'
import { useConfigStore } from '../store/config-store'
import { StationStatus } from '../types'
import type { DDT2Frame } from '../types'
import type { ChatEngine } from '../engine/chat'
import type { SessionManager } from '../engine/session-mgr'

interface ContextMenu {
  x: number
  y: number
  callsign: string
}

interface StationsListProps {
  chatRef: React.MutableRefObject<ChatEngine | null>
  sessionMgrRef: React.MutableRefObject<SessionManager | null>
  onShowOnMap?: (callsign: string) => void
}

export function StationsList({ chatRef, sessionMgrRef, onShowOnMap }: StationsListProps) {
  const stations = useStationStore((s) => s.stations)
  const addPing = usePingStore((s) => s.addPing)
  const portStatuses = usePortStore((s) => s.statuses)
  const ports = useConfigStore((s) => s.config.ports)
  const removeStation = useStationStore((s) => s.removeStation)
  const stationList = Object.values(stations).sort((a, b) => b.lastHeard - a.lastHeard)
  const pingingAllRef = useRef(false)
  const requestingPosRef = useRef(false)
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [ctxMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, callsign: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, callsign })
  }, [])

  const handlePing = useCallback(
    async (callsign: string) => {
      addPing({ from: 'me', to: callsign, type: 'request', data: 'Ping Request', timestamp: Date.now() })
      try {
        await chatRef.current?.sendPing(callsign)
      } catch (err) {
        console.error('[StationsList] Ping failed:', err)
      }
    },
    [chatRef, addPing],
  )

  const handlePingAll = useCallback(async () => {
    if (pingingAllRef.current) return
    pingingAllRef.current = true

    const connectedPorts = ports.filter((p) => portStatuses[p.name] === 'connected')

    for (const port of connectedPorts) {
      if (!pingingAllRef.current) break
      addPing({ from: 'me', to: 'CQCQCQ', type: 'request', data: 'Ping Request', timestamp: Date.now() })
      try {
        await chatRef.current?.sendPing('CQCQCQ', undefined, port.name)
      } catch (err) {
        console.error('[StationsList] Ping all failed on port', port.name, err)
      }
      await new Promise(r => setTimeout(r, 500))
    }

    pingingAllRef.current = false
  }, [ports, portStatuses, chatRef, addPing])

  const handleRequestPos = useCallback(async (callsign: string) => {
    const sessionMgr = sessionMgrRef.current
    if (!sessionMgr) return

    const connectedPorts = ports.filter((p) => portStatuses[p.name] === 'connected')
    const data = new TextEncoder().encode('position?')

    for (const port of connectedPorts) {
      const frame: DDT2Frame = {
        header: {
          magic: 0x22,
          seq: 0,
          sessionId: 7,
          type: 0,
          checksum: 0,
          length: data.length,
          sourceStation: sessionMgr.getStation(),
          destStation: callsign,
        },
        data,
      }
      try {
        await sessionMgr.outgoing(frame, port.name)
      } catch (err) {
        console.error('[StationsList] Position request failed for', callsign, err)
      }
    }
  }, [ports, portStatuses, sessionMgrRef])

  const handleRequestAllPositions = useCallback(async () => {
    const sessionMgr = sessionMgrRef.current
    if (!sessionMgr || requestingPosRef.current) return
    requestingPosRef.current = true

    const connectedPorts = ports.filter((p) => portStatuses[p.name] === 'connected')
    const data = new TextEncoder().encode('position?')

    for (const port of connectedPorts) {
      if (!requestingPosRef.current) break
      const frame: DDT2Frame = {
        header: {
          magic: 0x22,
          seq: 0,
          sessionId: 7,
          type: 0,
          checksum: 0,
          length: data.length,
          sourceStation: sessionMgr.getStation(),
          destStation: 'CQCQCQ',
        },
        data,
      }
      try {
        await sessionMgr.outgoing(frame, port.name)
      } catch (err) {
        console.error('[StationsList] Position request failed on port', port.name, err)
      }
      await new Promise(r => setTimeout(r, 500))
    }

    requestingPosRef.current = false
  }, [ports, portStatuses, sessionMgrRef])

  const handleQrzLookup = useCallback((callsign: string) => {
    window.open(`https://www.qrz.com/db/${callsign}`, '_blank', 'noopener')
  }, [])

  const handleRemove = useCallback((callsign: string) => {
    removeStation(callsign)
    setCtxMenu(null)
  }, [removeStation])

  const handleClearAll = useCallback(() => {
    if (window.confirm('Remove all stations from the heard list?')) {
      const clearStations = useStationStore.getState().clearStations
      clearStations()
    }
  }, [])

  return (
    <div className="station-list-compact">
      <div className="station-list-toolbar">
        <button
          className="btn-ping-all"
          onClick={handlePingAll}
          disabled={pingingAllRef.current}
        >
          {pingingAllRef.current ? 'Pinging...' : 'Ping All'}
        </button>
        <button
          className="btn-reqpos-all"
          onClick={handleRequestAllPositions}
          disabled={requestingPosRef.current}
        >
          {requestingPosRef.current ? 'Requesting...' : 'Request All Pos'}
        </button>
        <button className="btn-clear-all" onClick={handleClearAll} title="Clear all stations">
          Clear All
        </button>
      </div>
      {stationList.length === 0 ? (
        <p className="empty-state">No stations heard</p>
      ) : (
        stationList.map((s) => (
          <div key={s.callsign} className="station-item" onContextMenu={(e) => handleContextMenu(e, s.callsign)}>
            <span
              className={`status-dot ${s.position ? 'gps' : s.status === StationStatus.Online ? 'online' : s.status === StationStatus.Unattended ? 'warning' : 'offline'}`}
              title={s.position ? 'GPS position available' : ''}
            />
            <span className="station-call">{s.callsign}{s.position ? <span className="gps-badge"> GPS</span> : null}</span>
            <span className="station-time">{new Date(s.lastHeard).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))
      )}
      {ctxMenu && (
        <>
          <div className="ctx-backdrop" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <button className="ctx-item" onClick={() => { handlePing(ctxMenu.callsign); setCtxMenu(null) }}>Ping {ctxMenu.callsign}</button>
            <button className="ctx-item" onClick={() => { handleRequestPos(ctxMenu.callsign); setCtxMenu(null) }}>Request Position</button>
            {stations[ctxMenu.callsign]?.position && (
              <button className="ctx-item" onClick={() => { onShowOnMap?.(ctxMenu.callsign); setCtxMenu(null) }}>Show on Map</button>
            )}
            <button className="ctx-item" onClick={() => { handleQrzLookup(ctxMenu.callsign); setCtxMenu(null) }}>Lookup on QRZ</button>
            <button className="ctx-item ctx-danger" onClick={() => handleRemove(ctxMenu.callsign)}>Remove from List</button>
          </div>
        </>
      )}
    </div>
  )
}
