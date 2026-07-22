import { create } from 'zustand'
import type { PingInfo } from '../types'

interface PingState {
  pings: PingInfo[]
  addPing: (ping: PingInfo) => void
  clearPings: () => void
}

export const usePingStore = create<PingState>()((set) => ({
  pings: [],
  addPing: (ping) =>
    set((state) => ({ pings: [...state.pings, ping].slice(-50) })),
  clearPings: () => set({ pings: [] }),
}))
