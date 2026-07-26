import { useState, useCallback } from 'react'
import { useFileStore } from '../store/file-store'
import type { FileTransferEngine } from '../engine/file'
import type { RPCEngine } from '../engine/rpc'
import { formatFileSize as formatSize } from '../utils/format'
import { SharedFiles } from './SharedFiles'
import { RemoteBrowser } from './RemoteBrowser'

interface FileTransferProps {
  fileRef: React.MutableRefObject<FileTransferEngine | null>
  rpcRef: React.MutableRefObject<RPCEngine | null>
}

function formatPct(transferred: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.min(100, Math.round((transferred / total) * 100))}%`
}

export function FileTransfer({ fileRef, rpcRef }: FileTransferProps) {
  const transfers = useFileStore((s) => s.transfers)
  const addTransfer = useFileStore((s) => s.addTransfer)
  const updateTransfer = useFileStore((s) => s.updateTransfer)
  const clearTransfers = useFileStore((s) => s.clearTransfers)

  const [dest, setDest] = useState('CQCQCQ')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSend = useCallback(async () => {
    if (!file || !fileRef.current) return
    setSending(true)
    setError('')

    const id = crypto.randomUUID()
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      addTransfer({
        id,
        sessionId: -1,
        filename: file.name,
        size: data.byteLength,
        transferred: 0,
        direction: 'send',
        state: 'transferring',
        station: dest,
      })
      await fileRef.current.sendFile(file.name, data, dest, (sessionId) => updateTransfer(id, { sessionId }))
    } catch (err) {
      updateTransfer(id, { state: 'error' })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }, [file, dest, fileRef, addTransfer, updateTransfer])

  const handleAccept = useCallback(
    (sessionId: number) => {
      void fileRef.current?.acceptOffer(sessionId)
    },
    [fileRef],
  )

  const handleReject = useCallback(
    (id: string, sessionId: number) => {
      fileRef.current?.rejectFile(sessionId)
      updateTransfer(id, { state: 'error' })
    },
    [fileRef, updateTransfer],
  )

  const handleDownload = useCallback(
    (sessionId: number, filename: string) => {
      const data = fileRef.current?.getCompletedData(sessionId)
      if (!data) return
      const buffer = new ArrayBuffer(data.byteLength)
      new Uint8Array(buffer).set(data)
      const blob = new Blob([buffer])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    [fileRef],
  )

  return (
    <div>
      <h2>File Transfer</h2>

      <div className="panel-card">
        <h3>Send File</h3>
        <div className="form-row">
          <label htmlFor="file-dest">Destination</label>
          <input
            id="file-dest"
            type="text"
            value={dest}
            onChange={(e) => setDest(e.target.value.toUpperCase())}
            placeholder="Callsign or CQCQCQ"
          />
        </div>
        <div className="form-row">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSend} disabled={!file || sending || dest === 'CQCQCQ'}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        {dest === 'CQCQCQ' && <p className="empty-state">File transfer needs a specific destination callsign.</p>}
        {error && <p className="empty-state">{error}</p>}
      </div>

      <div className="panel-card">
        <div className="card-header-row">
          <h3>Transfers</h3>
          {transfers.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={clearTransfers}>
              Clear
            </button>
          )}
        </div>

        {transfers.length === 0 && (
          <p className="empty-state">No file transfers yet.</p>
        )}

        {transfers.map((t) => (
          <div key={t.id} className="transfer-item">
            <div className="transfer-info">
              <span className="transfer-name">{t.filename}</span>
              <span className={`transfer-badge ${t.direction}`}>
                {t.direction === 'send' ? '↑ Send' : '↓ Receive'}
              </span>
              <span className="transfer-size">{formatSize(t.size)}</span>
              <span className="transfer-station">{t.station}</span>
            </div>
            <div className="transfer-progress-row">
              <div className="progress-bar">
                <div
                  className={`progress-fill ${t.state === 'complete' ? 'complete' : t.state === 'error' ? 'error' : ''}`}
                  style={{ width: formatPct(t.transferred, t.size) }}
                />
              </div>
              <span className="transfer-pct">
                {formatPct(t.transferred, t.size)}
                {t.transferred > 0 && ` (${formatSize(t.transferred)})`}
              </span>
            </div>
            <div className="transfer-state">
              {t.state}
              {t.state === 'offer' && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => handleAccept(t.sessionId)}>
                    Accept
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleReject(t.id, t.sessionId)}>
                    Reject
                  </button>
                </>
              )}
              {t.state === 'complete' && t.direction === 'receive' && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(t.sessionId, t.filename)}>
                  Download
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <SharedFiles />
      <RemoteBrowser rpcRef={rpcRef} />
    </div>
  )
}
