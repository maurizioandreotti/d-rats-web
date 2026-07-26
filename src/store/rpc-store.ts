import { create } from 'zustand'
import type { RemoteFileEntry } from '../types'

interface StationListing {
  status: 'loading' | 'loaded' | 'error'
  files: RemoteFileEntry[]
  error: string
  pulling: string | null
}

interface RpcState {
  listings: Record<string, StationListing>
  setLoading: (station: string) => void
  setLoaded: (station: string, files: RemoteFileEntry[]) => void
  setError: (station: string, error: string) => void
  setPulling: (station: string, filename: string | null) => void
}

const emptyListing = (): StationListing => ({ status: 'loading', files: [], error: '', pulling: null })

export const useRpcStore = create<RpcState>()((set) => ({
  listings: {},
  setLoading: (station) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'loading', error: '' } },
    })),
  setLoaded: (station, files) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'loaded', files, error: '' } },
    })),
  setError: (station, error) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], status: 'error', error } },
    })),
  setPulling: (station, filename) =>
    set((state) => ({
      listings: { ...state.listings, [station]: { ...emptyListing(), ...state.listings[station], pulling: filename } },
    })),
}))
