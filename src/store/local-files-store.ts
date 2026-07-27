import { create } from 'zustand'
import {
  pickFolder,
  getStoredFolder,
  hasPermission,
  requestPermission,
  listFolder,
  writeFolderFile,
  removeFolderFile,
  type LocalFileEntry,
} from '../engine/local-files'

interface LocalFilesState {
  handle: FileSystemDirectoryHandle | null
  folderName: string | null
  permission: 'unknown' | 'granted' | 'needs-permission'
  files: LocalFileEntry[]
  loading: boolean
  error: string
  init: () => Promise<void>
  pick: () => Promise<void>
  reconnect: () => Promise<void>
  refresh: () => Promise<void>
  addFile: (name: string, data: Uint8Array) => Promise<void>
  removeFile: (name: string) => Promise<boolean>
}

export const useLocalFilesStore = create<LocalFilesState>()((set, get) => ({
  handle: null,
  folderName: null,
  permission: 'unknown',
  files: [],
  loading: false,
  error: '',

  init: async () => {
    const handle = await getStoredFolder()
    if (!handle) return

    const granted = await hasPermission(handle)
    set({ handle, folderName: handle.name, permission: granted ? 'granted' : 'needs-permission' })
    if (granted) await get().refresh()
  },

  pick: async () => {
    const handle = await pickFolder()
    set({ handle, folderName: handle.name, permission: 'granted' })
    await get().refresh()
  },

  reconnect: async () => {
    const { handle } = get()
    if (!handle) return
    const granted = await requestPermission(handle)
    set({ permission: granted ? 'granted' : 'needs-permission' })
    if (granted) await get().refresh()
  },

  refresh: async () => {
    const { handle } = get()
    if (!handle) return
    set({ loading: true, error: '' })
    try {
      const files = await listFolder(handle)
      set({ files, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  addFile: async (name, data) => {
    const { handle } = get()
    if (!handle) return
    await writeFolderFile(handle, name, data)
    await get().refresh()
  },

  removeFile: async (name) => {
    const { handle } = get()
    if (!handle) return false
    const removed = await removeFolderFile(handle, name)
    if (removed) await get().refresh()
    return removed
  },
}))
