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
  addPacket: (dir: 'rx' | 'tx', data: Uint8Array) => void
  clearPackets: () => void
  togglePause: () => void
}

let nextId = 0

export const useSnifferStore = create<SnifferState>()((set) => ({
  packets: [],
  paused: false,
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
      return { packets }
    }),
  clearPackets: () => set({ packets: [] }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}))
