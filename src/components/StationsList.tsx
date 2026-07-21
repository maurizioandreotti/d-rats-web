import { useStationStore } from '../store/station-store'
import { StationStatus } from '../types'

const STATUS_LABELS: Record<StationStatus, string> = {
  [StationStatus.Unknown]: 'Unknown',
  [StationStatus.Online]: 'Online',
  [StationStatus.Unattended]: 'Unattended',
  [StationStatus.Offline]: 'Offline',
}

export function StationsList() {
  const stations = useStationStore((s) => s.stations)
  const stationList = Object.values(stations).sort((a, b) => b.lastHeard - a.lastHeard)

  return (
    <div>
      <h2>Stations</h2>

      {stationList.length === 0 && (
        <div className="panel-card">
          <p className="empty-state">No stations heard yet. Connect to the radio and wait for signals.</p>
        </div>
      )}

      <div className="station-grid">
        {stationList.map((s) => (
          <div key={s.callsign} className="station-card">
            <div className="station-header">
              <span className={`status-dot ${s.status === StationStatus.Online ? 'online' : s.status === StationStatus.Unattended ? 'warning' : 'offline'}`} />
              <strong className="station-callsign">{s.callsign}</strong>
            </div>
            <div className="station-details">
              <p>Status: {STATUS_LABELS[s.status] ?? 'Unknown'}</p>
              <p>Last heard: {new Date(s.lastHeard).toLocaleTimeString()}</p>
              {s.position && (
                <p>
                  Position: {s.position.lat.toFixed(4)}, {s.position.lon.toFixed(4)}
                </p>
              )}
              {s.port && <p>Port: {s.port}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
