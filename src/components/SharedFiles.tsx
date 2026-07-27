import { useCallback, useRef, useState } from 'react'
import { useLocalFilesStore } from '../store/local-files-store'
import { useFileStore } from '../store/file-store'
import { useEventStore } from '../store/event-store'
import { isSupported, readFolderFile } from '../engine/local-files'
import { formatFileSize } from '../utils/format'
import type { FileTransferEngine } from '../engine/file'

interface SharedFilesProps {
  fileRef: React.MutableRefObject<FileTransferEngine | null>
  station: string
}

export function SharedFiles({ fileRef, station }: SharedFilesProps) {
  const handle = useLocalFilesStore((s) => s.handle)
  const folderName = useLocalFilesStore((s) => s.folderName)
  const permission = useLocalFilesStore((s) => s.permission)
  const files = useLocalFilesStore((s) => s.files)
  const loading = useLocalFilesStore((s) => s.loading)
  const error = useLocalFilesStore((s) => s.error)
  const pick = useLocalFilesStore((s) => s.pick)
  const reconnect = useLocalFilesStore((s) => s.reconnect)
  const refresh = useLocalFilesStore((s) => s.refresh)
  const addFile = useLocalFilesStore((s) => s.addFile)
  const removeFile = useLocalFilesStore((s) => s.removeFile)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const { addTransfer, updateTransfer } = useFileStore()

  const toggleSelected = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleAdd = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? [])
      e.target.value = ''
      for (const f of picked) {
        await addFile(f.name, new Uint8Array(await f.arrayBuffer()))
      }
    },
    [addFile],
  )

  const handleDelete = useCallback(async () => {
    for (const name of selected) await removeFile(name)
    setSelected(new Set())
  }, [selected, removeFile])

  const handleUpload = useCallback(async () => {
    if (!handle || selected.size !== 1 || !station || !fileRef.current) return
    const [filename] = [...selected]
    setUploading(true)
    let id: string | null = null
    try {
      const data = await readFolderFile(handle, filename!)
      if (!data) throw new Error(`Could not read "${filename}" from the shared folder`)

      id = crypto.randomUUID()
      addTransfer({ id, sessionId: -1, filename: filename!, size: data.byteLength, transferred: 0, direction: 'send', state: 'transferring', station, timestamp: Date.now() })
      await fileRef.current.sendFile(filename!, data, station, (sessionId) => updateTransfer(id!, { sessionId }))
    } catch (err) {
      if (id) updateTransfer(id, { state: 'error', timestamp: Date.now() })
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[File] Upload to ${station} failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'frame',
      })
    } finally {
      setUploading(false)
    }
  }, [handle, selected, station, fileRef, addTransfer, updateTransfer])

  if (!isSupported()) {
    return (
      <div className="file-pane">
        <h3>Local</h3>
        <p className="empty-state">
          Your browser doesn't support picking a local folder (File System Access API). Try Chrome or Edge.
        </p>
      </div>
    )
  }

  if (!folderName) {
    return (
      <div className="file-pane">
        <h3>Local</h3>
        <p className="empty-state">Choose the folder you want to share with other stations.</p>
        <button className="btn btn-sm btn-primary" onClick={() => void pick()}>Choose Folder…</button>
      </div>
    )
  }

  if (permission === 'needs-permission') {
    return (
      <div className="file-pane">
        <h3>Local</h3>
        <p className="empty-state">Reconnect to "{folderName}" to continue sharing it.</p>
        <button className="btn btn-sm btn-primary" onClick={() => void reconnect()}>Reconnect</button>
      </div>
    )
  }

  return (
    <div className="file-pane">
      <div className="file-pane-header">
        <h3>Local</h3>
        <div className="file-pane-toolbar">
          <button className="btn btn-sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-sm btn-danger-outline" onClick={handleDelete} disabled={selected.size === 0}>
            Delete
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleUpload}
            disabled={selected.size !== 1 || !station || uploading}
            title={!station ? 'Select a station on the right first' : undefined}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
      <p className="help-text">
        Folder: {folderName}
        {' — '}
        <button className="btn-link" onClick={() => addInputRef.current?.click()}>+ Add file to folder</button>
        <input ref={addInputRef} type="file" multiple hidden onChange={handleAdd} />
      </p>

      {error && <p className="empty-state">{error}</p>}
      {!error && files.length === 0 && <p className="empty-state">This folder is empty.</p>}

      {files.length > 0 && (
        <table className="file-table">
          <thead>
            <tr>
              <th></th>
              <th>Filename</th>
              <th>Size</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name} className={selected.has(f.name) ? 'selected' : ''} onClick={() => toggleSelected(f.name)}>
                <td><input type="checkbox" checked={selected.has(f.name)} onChange={() => toggleSelected(f.name)} onClick={(e) => e.stopPropagation()} /></td>
                <td>{f.name}</td>
                <td>{formatFileSize(f.size)}</td>
                <td>{new Date(f.lastModified).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
