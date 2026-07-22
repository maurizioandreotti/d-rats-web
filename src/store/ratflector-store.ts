import { create } from 'zustand'
import type { PingInfo } from '../types'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface RatflectorState {
  status: ConnectionStatus
  statusMessage: string
  host: string
  port: number
  pings: PingInfo[]
  setStatus: (status: ConnectionStatus, message?: string) => void
  setHost: (host: string) => void
  setPort: (port: number) => void
  addPing: (ping: PingInfo) => void
  clearPings: () => void
}

export const useRatflectorStore = create<RatflectorState>()((set) => ({
  status: 'disconnected',
  statusMessage: '',
  host: 'ref.d-rats.com',
  port: 9000,
  pings: [],
  setStatus: (status, message = '') => set({ status, statusMessage: message }),
  setHost: (host) => set({ host }),
  setPort: (port) => set({ port }),
  addPing: (ping) =>
    set((state) => ({ pings: [...state.pings, ping].slice(-100) })),
  clearPings: () => set({ pings: [] }),
}))
