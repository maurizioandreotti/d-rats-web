import { useChatStore } from '../store/chat-store'
import { useFileStore } from '../store/file-store'

export function EventLog() {
  const messages = useChatStore((s) => s.messages)
  const transfers = useFileStore((s) => s.transfers)

  const events: Array<{ time: number; text: string }> = []

  for (const msg of messages) {
    events.push({
      time: msg.timestamp,
      text: `[Chat] ${msg.direction === 'incoming' ? '←' : '→'} ${msg.from} → ${msg.to}: ${msg.text.substring(0, 80)}`,
    })
  }

  for (const t of transfers) {
    events.push({
      time: Date.now(),
      text: `[File] ${t.direction === 'receive' ? '↓' : '↑'} ${t.filename} - ${t.state}`,
    })
  }

  events.sort((a, b) => b.time - a.time)

  return (
    <div>
      <h2>Event Log</h2>

      {events.length === 0 && (
        <div className="panel-card">
          <p className="empty-state">No events yet.</p>
        </div>
      )}

      <div className="event-list">
        {events.slice(0, 200).map((evt, i) => (
          <div key={`${evt.time}-${i}`} className="event-item">
            <span className="event-time">{new Date(evt.time).toLocaleTimeString()}</span>
            <span className="event-text">{evt.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
