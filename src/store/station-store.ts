import { create } from 'zustand'
import type { Station, GPSPosition } from '../types'
import { StationStatus } from '../types'

interface StationState {
  stations: Map<string, Station>
  ownPosition?: GPSPosition
  updateStation: (callsign: string, partial: Partial<Station>) => void
  setStationPosition: (callsign: string, pos: GPSPosition) => void
  setStationStatus: (callsign: string, status: StationStatus) => void
  setOwnPosition: (pos: GPSPosition) => void
  removeStation: (callsign: string) => void
  clearStations: () => void
}

export const useStationStore = create<StationState>()((set) => ({
  stations: new Map(),
  ownPosition: undefined,
  updateStation: (callsign, partial) =>
    set((state) => {
      const stations = new Map(state.stations)
      const existing = stations.get(callsign)
      stations.set(callsign, { ...existing ?? { callsign, status: StationStatus.Unknown, lastHeard: Date.now() }, ...partial })
      return { stations }
    }),
  setStationPosition: (callsign, pos) =>
    set((state) => {
      const stations = new Map(state.stations)
      const existing = stations.get(callsign) ?? { callsign, status: StationStatus.Unknown, lastHeard: Date.now() }
      stations.set(callsign, { ...existing, position: pos })
      return { stations }
    }),
  setStationStatus: (callsign, status) =>
    set((state) => {
      const stations = new Map(state.stations)
      const existing = stations.get(callsign) ?? { callsign, status, lastHeard: Date.now() }
      stations.set(callsign, { ...existing, status })
      return { stations }
    }),
  setOwnPosition: (pos) => set({ ownPosition: pos }),
  removeStation: (callsign) =>
    set((state) => {
      const stations = new Map(state.stations)
      stations.delete(callsign)
      return { stations }
    }),
  clearStations: () => set({ stations: new Map() }),
}))
