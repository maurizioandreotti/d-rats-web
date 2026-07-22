import { useCallback, useRef } from 'react'
import { useStationStore } from '../store/station-store'
import { usePingStore } from '../store/ping-store'
import { StationStatus } from '../types'
import type { ChatEngine } from '../engine/chat'
import type { SessionManager } from '../engine/session-mgr'

interface StationsListProps {
  chatRef: React.MutableRefObject<ChatEngine | null>
  sessionMgrRef: React.MutableRefObject<SessionManager | null>
}

export function StationsList({ chatRef, sessionMgrRef }: StationsListProps) {
  const stations = useStationStore((s) => s.stations)
  const addPing = usePingStore((s) => s.addPing)
  const stationList = Object.values(stations).sort((a, b) => b.lastHeard - a.lastHeard)
  const pingingAllRef = useRef(false)

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
    const sessionMgr = sessionMgrRef.current
    if (!sessionMgr || pingingAllRef.current) return
    pingingAllRef.current = true

    const myCall = sessionMgr.getStation()
    const heard = sessionMgr.getHeardStations()
    const targets = [...heard.keys()].filter(c => c !== 'CQCQCQ' && c !== myCall)

    for (const callsign of targets) {
      if (!pingingAllRef.current) break
      addPing({ from: 'me', to: callsign, type: 'request', data: 'Ping Request', timestamp: Date.now() })
      try {
        await chatRef.current?.sendPing(callsign)
      } catch (err) {
        console.error('[StationsList] Ping all failed for', callsign, err)
      }
      await new Promise(r => setTimeout(r, 500))
    }

    pingingAllRef.current = false
  }, [sessionMgrRef, chatRef, addPing])

  return (
    <div className="station-list-compact">
      <button
        className="btn-ping-all"
        onClick={handlePingAll}
        disabled={pingingAllRef.current}
      >
        {pingingAllRef.current ? 'Pinging...' : 'Ping All'}
      </button>
      {stationList.length === 0 ? (
        <p className="empty-state">No stations heard</p>
      ) : (
        stationList.map((s) => (
          <div key={s.callsign} className="station-item">
            <span
              className={`status-dot ${s.status === StationStatus.Online ? 'online' : s.status === StationStatus.Unattended ? 'warning' : 'offline'}`}
            />
            <span className="station-call">{s.callsign}</span>
            <span className="station-time">{new Date(s.lastHeard).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="station-actions">
              <button className="btn-ping" onClick={() => handlePing(s.callsign)} title="Ping">P</button>
            </span>
          </div>
        ))
      )}
    </div>
  )
}
