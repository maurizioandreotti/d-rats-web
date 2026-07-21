import { useRef, useEffect } from 'react'
import { useSnifferStore, type SniffedPacket } from '../store/sniffer-store'

function formatHex(data: Uint8Array): string {
  const bytes: string[] = []
  for (let i = 0; i < data.length; i++) {
    bytes.push(data[i]!.toString(16).padStart(2, '0'))
  }
  return bytes.join(' ')
}

function formatAscii(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i++) {
    const b = data[i]!
    out += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'
  }
  return out
}

function PacketRow({ packet }: { packet: SniffedPacket }) {
  const hex = formatHex(packet.data)
  const ascii = formatAscii(packet.data)
  const time = new Date(packet.timestamp).toLocaleTimeString('it-IT', { hour12: false }) +
    '.' + String(packet.timestamp % 1000).padStart(3, '0')

  const marker = packet.direction === 'rx' ? '←' : '→'
  const cls = packet.direction === 'rx' ? 'sniff-rx' : 'sniff-tx'

  return (
    <div className={`sniff-row ${cls}`}>
      <span className="sniff-time">{time}</span>
      <span className="sniff-dir">{marker}</span>
      <span className="sniff-len">{packet.data.length}B</span>
      <span className="sniff-hex">{hex}</span>
      <span className="sniff-ascii">{ascii}</span>
    </div>
  )
}

export function SnifferPanel() {
  const packets = useSnifferStore((s) => s.packets)
  const paused = useSnifferStore((s) => s.paused)
  const clearPackets = useSnifferStore((s) => s.clearPackets)
  const togglePause = useSnifferStore((s) => s.togglePause)
  const listRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  useEffect(() => {
    if (autoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [packets])

  const handleScroll = () => {
    if (!listRef.current) return
    const el = listRef.current
    autoScroll.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 100
  }

  return (
    <div className="sniffer-layout">
      <div className="sniffer-header">
        <h2>Data Sniffer</h2>
        <div className="sniffer-toolbar">
          <span className="sniff-count">{packets.length} packets</span>
          <button className="btn btn-sm" onClick={togglePause}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={clearPackets}>
            Clear
          </button>
        </div>
      </div>

      <div className="sniff-column-headers">
        <span className="sniff-time">Time</span>
        <span className="sniff-dir">D</span>
        <span className="sniff-len">Len</span>
        <span className="sniff-hex">Hex dump</span>
        <span className="sniff-ascii">ASCII</span>
      </div>

      <div className="sniff-list" ref={listRef} onScroll={handleScroll}>
        {packets.length === 0 && (
          <div className="empty-state">Waiting for data... Connect the radio and send/receive.</div>
        )}
        {packets.map((p) => (
          <PacketRow key={p.id} packet={p} />
        ))}
      </div>
    </div>
  )
}
