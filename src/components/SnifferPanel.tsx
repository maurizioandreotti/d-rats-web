import { useRef, useEffect, useMemo } from 'react'
import { useSnifferStore, type SniffedPacket } from '../store/sniffer-store'

const SOB_MARKER = new Uint8Array([0xDD, 0xDD, 0xDD, 0xDD])
const EOB_MARKER = new Uint8Array([0xEE, 0xEE, 0xEE, 0xEE])

function detectType(data: Uint8Array): string {
  const text = new TextDecoder().decode(data.slice(0, 60))
  if (data.length >= 4) {
    const head = data.slice(0, 4)
    if (head.every((b, i) => b === SOB_MARKER[i])) return 'ddt2'
    if (head.every((b, i) => b === EOB_MARKER[i])) return 'eob'
  }
  if (text.startsWith('$$CRC')) return 'gpsa'
  if (text.startsWith('$GP')) return 'nmea'
  const printable = data.filter(b => b >= 0x20 && b <= 0x7e).length
  if (printable > data.length * 0.7 && data.length > 4) return 'text'
  return 'data'
}

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
  const type = detectType(packet.data)
  const time = new Date(packet.timestamp).toLocaleTimeString('it-IT', { hour12: false }) +
    '.' + String(packet.timestamp % 1000).padStart(3, '0')

  const marker = packet.direction === 'rx' ? '←' : '→'
  const cls = packet.direction === 'rx' ? 'sniff-rx' : 'sniff-tx'

  return (
    <div className={`sniff-row ${cls} sniff-${type}`}>
      <span className="sniff-time">{time}</span>
      <span className="sniff-dir">{marker}</span>
      <span className="sniff-len">{packet.data.length}B</span>
      <span className={`sniff-type`}>{type}</span>
      {type === 'text' || type === 'gpsa' || type === 'nmea' ? (
        <span className="sniff-text">{new TextDecoder().decode(packet.data)}</span>
      ) : (
        <>
          <span className="sniff-hex">{hex}</span>
          <span className="sniff-ascii">{ascii}</span>
        </>
      )}
    </div>
  )
}

export function SnifferPanel() {
  const packets = useSnifferStore((s) => s.packets)
  const paused = useSnifferStore((s) => s.paused)
  const capturing = useSnifferStore((s) => s.capturing)
  const capturedPackets = useSnifferStore((s) => s.capturedPackets)
  const clearPackets = useSnifferStore((s) => s.clearPackets)
  const togglePause = useSnifferStore((s) => s.togglePause)
  const startCapture = useSnifferStore((s) => s.startCapture)
  const stopCapture = useSnifferStore((s) => s.stopCapture)
  const saveCapture = useSnifferStore((s) => s.saveCapture)
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

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of packets) {
      const t = detectType(p.data)
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [packets])

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
          <div className="sniffer-capture">
            {capturing ? (
              <button className="btn btn-sm btn-danger" onClick={stopCapture}>
                ⏹ Stop ({capturedPackets.length})
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={startCapture}>
                ⏺ Capture
              </button>
            )}
            {!capturing && capturedPackets.length > 0 && (
              <button className="btn btn-sm btn-success" onClick={saveCapture}>
                💾 Save ({capturedPackets.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sniff-column-headers">
        <span className="sniff-time">Time</span>
        <span className="sniff-dir">D</span>
        <span className="sniff-len">Len</span>
        <span className="sniff-type">Type</span>
        <span className="sniff-hex">Data</span>
      </div>

      <div className="sniff-legend">
        <span className="legend-item legend-ddt2">DDT2</span>
        <span className="legend-item legend-gpsa">GPS‑A</span>
        <span className="legend-item legend-nmea">NMEA</span>
        <span className="legend-item legend-text">Text</span>
        <span className="legend-item legend-data">Binary</span>
        <span className="legend-item legend-eob">EOB</span>
        {Object.entries(typeCounts).map(([t, c]) => (
          <span key={t} className="legend-count">{t}={c}</span>
        ))}
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
