import { useFileStore } from '../store/file-store'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPct(transferred: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.min(100, Math.round((transferred / total) * 100))}%`
}

export function FileTransfer() {
  const transfers = useFileStore((s) => s.transfers)
  const clearTransfers = useFileStore((s) => s.clearTransfers)

  return (
    <div>
      <h2>File Transfer</h2>

      <div className="panel-card">
        <h3>Send File</h3>
        <p className="empty-state">File sending will be implemented with the File System Access API.</p>
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
            <div className="transfer-state">{t.state}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
