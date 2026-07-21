import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Station, GPSPosition } from '../types'
import { StationStatus } from '../types'

interface StationState {
  stations: Record<string, Station>
  ownPosition?: GPSPosition
  updateStation: (callsign: string, partial: Partial<Station>) => void
  setStationPosition: (callsign: string, pos: GPSPosition) => void
  setStationStatus: (callsign: string, status: StationStatus) => void
  setOwnPosition: (pos: GPSPosition) => void
  removeStation: (callsign: string) => void
  clearStations: () => void
}

export const useStationStore = create<StationState>()(
  persist(
    (set) => ({
      stations: {},
      ownPosition: undefined,
      updateStation: (callsign, partial) =>
        set((state) => ({
          stations: {
            ...state.stations,
            [callsign]: {
              ...(state.stations[callsign] ?? { callsign, status: StationStatus.Unknown, lastHeard: Date.now() }),
              ...partial,
            },
          },
        })),
      setStationPosition: (callsign, pos) =>
        set((state) => ({
          stations: {
            ...state.stations,
            [callsign]: {
              ...(state.stations[callsign] ?? { callsign, status: StationStatus.Unknown, lastHeard: Date.now() }),
              position: pos,
            },
          },
        })),
      setStationStatus: (callsign, status) =>
        set((state) => ({
          stations: {
            ...state.stations,
            [callsign]: {
              ...(state.stations[callsign] ?? { callsign, status, lastHeard: Date.now() }),
              status,
            },
          },
        })),
      setOwnPosition: (pos) => set({ ownPosition: pos }),
      removeStation: (callsign) =>
        set((state) => {
          const { [callsign]: _, ...rest } = state.stations
          return { stations: rest }
        }),
      clearStations: () => set({ stations: {} }),
    }),
    { name: 'drats-stations' },
  ),
)
