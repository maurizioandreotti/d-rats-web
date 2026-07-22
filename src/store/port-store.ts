import { create } from 'zustand'

export type PortStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface PortState {
  statuses: Record<string, PortStatus>
  messages: Record<string, string>
  setStatus: (name: string, status: PortStatus, message?: string) => void
  getStatus: (name: string) => PortStatus
  getMessage: (name: string) => string
}

export const usePortStore = create<PortState>()((set, get) => ({
  statuses: {},
  messages: {},
  setStatus: (name, status, message = '') =>
    set((state) => ({
      statuses: { ...state.statuses, [name]: status },
      messages: { ...state.messages, [name]: message },
    })),
  getStatus: (name) => get().statuses[name] ?? 'disconnected',
  getMessage: (name) => get().messages[name] ?? '',
}))
