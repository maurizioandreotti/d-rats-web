import { create } from 'zustand'
import type { SharedFile } from '../types'

interface SharedFilesState {
  files: SharedFile[]
  addFile: (file: SharedFile) => void
  removeFile: (name: string) => void
}

export const useSharedFilesStore = create<SharedFilesState>()((set) => ({
  files: [],
  addFile: (file) =>
    set((state) => ({
      files: [...state.files.filter((f) => f.name !== file.name), file],
    })),
  removeFile: (name) =>
    set((state) => ({
      files: state.files.filter((f) => f.name !== name),
    })),
}))
