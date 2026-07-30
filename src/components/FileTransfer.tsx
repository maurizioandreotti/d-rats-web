import { useCallback, useEffect } from 'react'
import { useFileStore } from '../store/file-store'
import { useStationStore } from '../store/station-store'
import { useConfigStore } from '../store/config-store'
import { usePortStore } from '../store/port-store'
import { useRpcStore } from '../store/rpc-store'
import { useLocalFilesStore } from '../store/local-files-store'
import { useEventStore } from '../store/event-store'
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
  const updateTransfer = useFileStore((s) => s.updateTransfer)
  const clearTransfers = useFileStore((s) => s.clearTransfers)

  const stations = useStationStore((s) => s.stations)
  const heardStations = Object.keys(stations).sort()

  const config = useConfigStore((s) => s.config)
  const portStatuses = usePortStore((s) => s.statuses)
  const connectedPorts = config.ports.filter((p) => portStatuses[p.name] === 'connected')

  // Shared between the Local pane (Upload target) and the Remote pane
  // (Connect/Download/Delete target) — one station selector drives both,
  // matching D-RATS's single Files tab. Lives in rpc-store, not component
  // state, so it (and the Remote pane's connection) survives switching to
  // another tab and back.
  const station = useRpcStore((s) => s.selectedStation)
  const setStation = useRpcStore((s) => s.setSelectedStation)
  const port = useRpcStore((s) => s.selectedPort)
  const setPort = useRpcStore((s) => s.setSelectedPort)

  useEffect(() => {
    if (!port && connectedPorts.length > 0) setPort(connectedPorts[0]!.name)
  }, [connectedPorts, port, setPort])

  const handleAbort = useCallback(
    (id: string, sessionId: number) => {
      fileRef.current?.cancelTransfer(sessionId)
      updateTransfer(id, { state: 'error', timestamp: Date.now() })
    },
    [fileRef, updateTransfer],
  )

  const handleSave = useCallback(
    async (sessionId: number, filename: string) => {
      const data = fileRef.current?.getCompletedData(sessionId)
      if (!data) return

      const { handle, files, addFile } = useLocalFilesStore.getState()
      if (handle) {
        const exists = files.some((f) => f.name === filename)
        if (exists && !window.confirm(`"${filename}" already exists in the shared folder. Overwrite it?`)) {
          useEventStore.getState().addEvent({
            time: Date.now(),
            text: `[File] Save of "${filename}" skipped — already exists in the shared folder`,
            type: 'frame',
          })
          return
        }

        // Save alongside the shared files, same as D-RATS's download_dir —
        // not the browser's generic Downloads folder.
        await addFile(filename, data)
        useEventStore.getState().addEvent({
          time: Date.now(),
          text: `[File] Saved "${filename}" to the shared folder${exists ? ' (overwritten)' : ''}`,
          type: 'frame',
        })
        return
      }

      // No shared folder configured (Config → File Transfer) — fall back to
      // a normal browser save/download.
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
              {(t.state === 'negotiating' || t.state === 'transferring' || t.state === 'offer' || t.state === 'awaiting-response') && (
                <button className="btn btn-danger-outline btn-sm" onClick={() => handleAbort(t.id, t.sessionId)}>
                  Stop
                </button>
              )}
              {t.state === 'complete' && t.direction === 'receive' && (
                <button className="btn btn-secondary btn-sm" onClick={() => void handleSave(t.sessionId, t.filename)}>
                  Save
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="file-explorer">
        <SharedFiles fileRef={fileRef} station={station} />
        <RemoteBrowser
          rpcRef={rpcRef}
          heardStations={heardStations}
          station={station}
          onStationChange={setStation}
          connectedPorts={connectedPorts}
          port={port}
          onPortChange={setPort}
        />
      </div>
    </div>
  )
}
