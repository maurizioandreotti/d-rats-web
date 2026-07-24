import { useEventStore } from '../store/event-store'
import { useFileStore } from '../store/file-store'

export function EventLog() {
  const events = useEventStore((s) => s.events)
  const transfers = useFileStore((s) => s.transfers)

  const all: Array<{ time: number; text: string; type: string }> = [...events]

  for (const t of transfers) {
    all.push({
      time: Date.now(),
      text: `[File] ${t.direction === 'receive' ? '↓' : '↑'} ${t.filename} - ${t.state}`,
      type: 'file',
    })
  }

  all.sort((a, b) => b.time - a.time)

  const handleClear = () => {
    useEventStore.getState().clearEvents()
    useFileStore.getState().clearTransfers()
  }

  const handleExport = () => {
    const rows = all.map((e) =>
      `[${new Date(e.time).toISOString()}] ${e.text}`
    ).join('\n')
    const blob = new Blob([rows], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drats-eventlog-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="event-log-header">
        <h2>Event Log</h2>
        <div className="event-log-actions">
          <button className="btn-sm" onClick={handleExport}>Export</button>
          <button className="btn-sm btn-danger" onClick={() => { if (window.confirm('Clear all events?')) handleClear() }}>Clear</button>
        </div>
      </div>

      {all.length === 0 && (
        <div className="panel-card">
          <p className="empty-state">No events yet.</p>
        </div>
      )}

      <div className="event-list">
        {all.slice(0, 200).map((evt, i) => (
          <div key={`${evt.time}-${i}`} className={`event-item ${evt.type}`}>
            <span className="event-time">{new Date(evt.time).toLocaleTimeString()}</span>
            <span className="event-text">{evt.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
