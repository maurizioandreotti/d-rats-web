import { create } from 'zustand'
import type { RemoteFileEntry } from '../types'

interface StationListing {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  files: RemoteFileEntry[]
  error: string
}

interface RpcState {
  listings: Record<string, StationListing>
  // Lives here rather than as component state so the Files tab's Remote
  // pane (station/port picked, current listing) survives switching to
  // another tab and back — a component-local useState gets wiped by the
  // unmount that happens when the tab isn't the active one.
  selectedStation: string
  selectedPort: string
  setSelectedStation: (station: string) => void
  setSelectedPort: (port: string) => void
  setConnecting: (station: string) => void
  setConnected: (station: string, files: RemoteFileEntry[]) => void
  setError: (station: string, error: string) => void
  setDisconnected: (station: string) => void
}

const emptyListing = (): StationListing => ({ status: 'disconnected', files: [], error: '' })

export const useRpcStore = create<RpcState>()((set) => ({
  listings: {},
  selectedStation: '',
  selectedPort: '',
  setSelectedStation: (station) => set({ selectedStation: station }),
  setSelectedPort: (port) => set({ selectedPort: port }),
  setConnecting: (station) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'connecting', error: '' } },
    })),
  setConnected: (station, files) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'connected', files, error: '' } },
    })),
  setError: (station, error) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'error', error } },
    })),
  setDisconnected: (station) =>
    set((state) => ({
      listings: { ...state.listings, [station]: emptyListing() },
    })),
}))
