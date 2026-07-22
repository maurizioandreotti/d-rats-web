import { usePingStore } from '../store/ping-store'

export function PingPanel() {
  const pings = usePingStore((s) => s.pings)
  const clearPings = usePingStore((s) => s.clearPings)

  return (
    <div>
      <div className="panel-header">
        <h2>Pings</h2>
        {pings.length > 0 && (
          <button className="btn btn-sm" onClick={clearPings}>Clear</button>
        )}
      </div>

      {pings.length === 0 && (
        <div className="panel-card">
          <p className="empty-state">No pings yet. Right-click a station to ping it.</p>
        </div>
      )}

      <div className="ping-list">
        {pings.map((p, i) => (
          <div key={i} className="ping-entry">
            <div className="ping-header">
              <span className={`ping-type ping-${p.type}`}>{p.type}</span>
              <span className="ping-from">{p.from}</span>
              <span className="ping-arrow">{'\u2192'}</span>
              <span className="ping-to">{p.to}</span>
              <span className="ping-time">
                {new Date(p.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="ping-data">{p.data}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
