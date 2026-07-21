import { create } from 'zustand'
import type { FileTransferItem } from '../types'

interface FileState {
  transfers: FileTransferItem[]
  addTransfer: (item: FileTransferItem) => void
  updateTransfer: (id: string, partial: Partial<FileTransferItem>) => void
  removeTransfer: (id: string) => void
  clearTransfers: () => void
}

export const useFileStore = create<FileState>()((set) => ({
  transfers: [],
  addTransfer: (item) =>
    set((state) => ({ transfers: [...state.transfers, item] })),
  updateTransfer: (id, partial) =>
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, ...partial } : t,
      ),
    })),
  removeTransfer: (id) =>
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id),
    })),
  clearTransfers: () => set({ transfers: [] }),
}))
