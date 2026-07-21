import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppConfig } from '../types'

interface ConfigState {
  config: AppConfig
  updateConfig: (partial: Partial<AppConfig>) => void
  resetConfig: () => void
}

const DEFAULT_CONFIG: AppConfig = {
  myCallsign: '',
  serial: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'xon/xoff',
  },
  mapCenter: [41.9, 12.5],
  mapZoom: 8,
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      updateConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    { name: 'drats-config' },
  ),
)
