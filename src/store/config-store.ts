import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppConfig } from '../types'

interface ConfigState {
  config: AppConfig
  updateConfig: (partial: Partial<AppConfig>) => void
  updatePort: (index: number, port: Partial<AppConfig['ports'][0]>) => void
  addPort: (port: AppConfig['ports'][0]) => void
  removePort: (index: number) => void
  resetConfig: () => void
}

const CURRENT_VERSION = 2

const DEFAULT_CONFIG: AppConfig = {
  myCallsign: '',
  myName: '',
  signOnMessage: '',
  signOffMessage: '',
  pingInfo: '',
  units: 'imperial',
  showUtc: false,
  ports: [
    {
      enabled: true,
      type: 'serial',
      settings: '9600',
      sniff: false,
      raw: false,
      name: 'Radio',
      serial: {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'xon/xoff',
      },
    },
    {
      enabled: true,
      type: 'ratflector',
      settings: '',
      sniff: false,
      raw: false,
      name: 'RAT',
      ratflector: {
        host: 'ref.d-rats.com',
        port: 9000,
        callsign: '',
        password: '',
      },
    },
  ],
  mapCenter: [41.9, 12.5],
  mapZoom: 8,
  myPosition: undefined,
  autoConnect: false,
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      updateConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      updatePort: (index, port) =>
        set((state) => {
          const ports = [...state.config.ports]
          const existing = ports[index]!
          ports[index] = { ...existing, ...port, enabled: port.enabled ?? existing.enabled, type: port.type ?? existing.type }
          return { config: { ...state.config, ports } }
        }),
      addPort: (port) =>
        set((state) => ({
          config: { ...state.config, ports: [...state.config.ports, port] },
        })),
      removePort: (index) =>
        set((state) => ({
          config: {
            ...state.config,
            ports: state.config.ports.filter((_, i) => i !== index),
          },
        })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: 'drats-config',
      version: CURRENT_VERSION,
      migrate: () => DEFAULT_CONFIG,
    },
  ),
)
