import { create } from 'zustand'

export interface SniffedPacket {
  id: number
  timestamp: number
  direction: 'rx' | 'tx'
  data: Uint8Array
}

const MAX_PACKETS = 5000

interface SnifferState {
  packets: SniffedPacket[]
  paused: boolean
  capturing: boolean
  capturedPackets: SniffedPacket[]
  addPacket: (dir: 'rx' | 'tx', data: Uint8Array) => void
  clearPackets: () => void
  togglePause: () => void
  startCapture: () => void
  stopCapture: () => void
  saveCapture: () => void
}

let nextId = 0

export const useSnifferStore = create<SnifferState>()((set, get) => ({
  packets: [],
  paused: false,
  capturing: false,
  capturedPackets: [],
  addPacket: (dir, data) =>
    set((state) => {
      if (state.paused) return state
      const packet: SniffedPacket = {
        id: nextId++,
        timestamp: Date.now(),
        direction: dir,
        data: data.slice(0, 2048),
      }
      const packets = [...state.packets, packet]
      if (packets.length > MAX_PACKETS) {
        packets.splice(0, packets.length - MAX_PACKETS)
      }
      
      const capturedPackets = state.capturing 
        ? [...state.capturedPackets, packet]
        : state.capturedPackets
      
      return { packets, capturedPackets }
    }),
  clearPackets: () => set({ packets: [], capturedPackets: [] }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  startCapture: () => set({ capturing: true, capturedPackets: [] }),
  stopCapture: () => set({ capturing: false }),
  saveCapture: () => {
    const state = get()
    if (state.capturedPackets.length === 0) return
    
    const lines: string[] = []
    lines.push('# D-RATS Sniffer Capture')
    lines.push(`# Started: ${new Date(state.capturedPackets[0]!.timestamp).toISOString()}`)
    lines.push(`# Ended: ${new Date(state.capturedPackets[state.capturedPackets.length - 1]!.timestamp).toISOString()}`)
    lines.push(`# Total packets: ${state.capturedPackets.length}`)
    lines.push('')
    
    for (const pkt of state.capturedPackets) {
      const time = new Date(pkt.timestamp).toISOString()
      const dir = pkt.direction === 'rx' ? 'RX' : 'TX'
      const hex = Array.from(pkt.data).map(b => b.toString(16).padStart(2, '0')).join(' ')
      const ascii = Array.from(pkt.data).map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('')
      lines.push(`[${time}] ${dir} ${pkt.data.length}B`)
      lines.push(`  HEX: ${hex}`)
      lines.push(`  ASC: ${ascii}`)
      lines.push('')
    }
    
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drats-capture-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}))
