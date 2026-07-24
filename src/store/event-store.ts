import { create } from 'zustand'

export interface EventLogEntry {
  time: number
  text: string
  type: 'chat-in' | 'chat-out' | 'file' | 'gps' | 'raw' | 'frame' | 'ping'
}

const MAX_EVENTS = 1000

interface EventState {
  events: EventLogEntry[]
  addEvent: (entry: EventLogEntry) => void
  clearEvents: () => void
}

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  addEvent: (entry) =>
    set((state) => {
      const events = [...state.events, entry]
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS)
      }
      return { events }
    }),
  clearEvents: () => set({ events: [] }),
}))
