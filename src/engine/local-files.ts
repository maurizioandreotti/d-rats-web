// Wraps the File System Access API to back the "Local" file pane with a
// real folder on disk — matching D-RATS's `download_dir` preference
// (main_files.py's LocalFileView, dratspathspanel.py's "File Transfer
// Path") instead of an in-browser-memory file list.

const DB_NAME = 'drats-web'
const STORE_NAME = 'handles'
const FOLDER_HANDLE_KEY = 'sharedFolder'

export interface LocalFileEntry {
  name: string
  size: number
  lastModified: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as unknown)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(req.error as unknown)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error as unknown)
  })
}

// Only Chromium implements the File System Access API — same constraint
// this app already has via Web Serial, so nothing new.
export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await idbSet(FOLDER_HANDLE_KEY, handle)
  return handle
}

// Remembers the folder across reloads. Chromium still requires a fresh user
// gesture to reconfirm permission after a reload (security measure) — call
// ensurePermission() before using the returned handle.
export async function getStoredFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await idbGet<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY)
  } catch {
    return null
  }
}

export async function forgetFolder(): Promise<void> {
  await idbSet(FOLDER_HANDLE_KEY, null)
}

export async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
}

// Must be called from a user gesture (e.g. a click handler) — the browser
// will not show the reconfirmation prompt otherwise.
export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function listFolder(handle: FileSystemDirectoryHandle): Promise<LocalFileEntry[]> {
  const entries: LocalFileEntry[] = []
  for await (const [name, child] of handle.entries()) {
    if (child.kind !== 'file') continue
    const file = await (child as FileSystemFileHandle).getFile()
    entries.push({ name, size: file.size, lastModified: file.lastModified })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readFolderFile(handle: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const fileHandle = await handle.getFileHandle(name)
    const file = await fileHandle.getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null
  }
}

export async function writeFolderFile(
  handle: FileSystemDirectoryHandle,
  name: string,
  data: Uint8Array,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(new Blob([data as BlobPart]))
  await writable.close()
}

export async function removeFolderFile(handle: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await handle.removeEntry(name)
    return true
  } catch {
    return false
  }
}
