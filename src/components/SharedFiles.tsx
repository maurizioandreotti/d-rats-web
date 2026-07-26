import { useCallback } from 'react'
import { useSharedFilesStore } from '../store/shared-files-store'
import { formatFileSize } from '../utils/format'

export function SharedFiles() {
  const files = useSharedFilesStore((s) => s.files)
  const addFile = useSharedFilesStore((s) => s.addFile)
  const removeFile = useSharedFilesStore((s) => s.removeFile)

  const handleAdd = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? [])
      e.target.value = ''
      for (const f of picked) {
        const data = new Uint8Array(await f.arrayBuffer())
        addFile({ name: f.name, size: data.byteLength, data, addedAt: Date.now() })
      }
    },
    [addFile],
  )

  return (
    <div className="panel-card">
      <h3>Shared Files</h3>
      <p className="help-text">
        Files listed here are visible to other stations via a remote file list, and can be pulled by name.
        This lives only in browser memory — it's cleared on reload.
      </p>
      <div className="form-row">
        <input type="file" multiple onChange={handleAdd} />
      </div>

      {files.length === 0 && <p className="empty-state">Nothing shared yet.</p>}

      {files.map((f) => (
        <div key={f.name} className="transfer-item">
          <div className="transfer-info">
            <span className="transfer-name">{f.name}</span>
            <span className="transfer-size">{formatFileSize(f.size)}</span>
          </div>
          <button className="btn btn-sm btn-danger-outline" onClick={() => removeFile(f.name)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
