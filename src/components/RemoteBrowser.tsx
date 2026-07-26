import { useState, useCallback } from 'react'
import { useRpcStore } from '../store/rpc-store'
import { useEventStore } from '../store/event-store'
import type { RPCEngine } from '../engine/rpc'

interface RemoteBrowserProps {
  rpcRef: React.MutableRefObject<RPCEngine | null>
}

export function RemoteBrowser({ rpcRef }: RemoteBrowserProps) {
  const [dest, setDest] = useState('')
  const listings = useRpcStore((s) => s.listings)
  const setLoading = useRpcStore((s) => s.setLoading)
  const setLoaded = useRpcStore((s) => s.setLoaded)
  const setError = useRpcStore((s) => s.setError)
  const setPulling = useRpcStore((s) => s.setPulling)

  const listing = dest ? listings[dest] : undefined

  const handleList = useCallback(async () => {
    if (!dest || !rpcRef.current) return
    setLoading(dest)
    try {
      const files = await rpcRef.current.listFiles(dest)
      setLoaded(dest, files)
    } catch (err) {
      setError(dest, err instanceof Error ? err.message : String(err))
    }
  }, [dest, rpcRef, setLoading, setLoaded, setError])

  const handlePull = useCallback(
    async (filename: string) => {
      if (!rpcRef.current) return
      setPulling(dest, filename)
      try {
        const result = await rpcRef.current.pullFile(dest, filename)
        useEventStore.getState().addEvent({
          time: Date.now(),
          text: result.ok
            ? `[RPC] Pull "${filename}" from ${dest} accepted — incoming transfer will appear below`
            : `[RPC] Pull "${filename}" from ${dest} failed: ${result.message}`,
          type: 'frame',
        })
      } catch (err) {
        useEventStore.getState().addEvent({
          time: Date.now(),
          text: `[RPC] Pull "${filename}" from ${dest} failed: ${err instanceof Error ? err.message : String(err)}`,
          type: 'frame',
        })
      } finally {
        setPulling(dest, null)
      }
    },
    [dest, rpcRef, setPulling],
  )

  return (
    <div className="panel-card">
      <h3>Browse Remote Station</h3>
      <p className="help-text">
        Lists files a remote station has shared, then pulls one by name. The bytes arrive as a normal
        incoming transfer above — accept it there once it shows up.
      </p>
      <div className="form-row">
        <label htmlFor="rpc-dest">Station</label>
        <input
          id="rpc-dest"
          type="text"
          value={dest}
          onChange={(e) => setDest(e.target.value.toUpperCase())}
          placeholder="Callsign"
        />
        <button className="btn btn-sm btn-primary" onClick={handleList} disabled={!dest || listing?.status === 'loading'}>
          {listing?.status === 'loading' ? 'Listing…' : 'List Files'}
        </button>
      </div>

      {listing?.status === 'error' && <p className="empty-state">{listing.error}</p>}
      {listing?.status === 'loaded' && listing.files.length === 0 && (
        <p className="empty-state">{dest} has no shared files.</p>
      )}

      {listing?.status === 'loaded' &&
        listing.files.map((f) => (
          <div key={f.name} className="transfer-item">
            <div className="transfer-info">
              <span className="transfer-name">{f.name}</span>
              <span className="transfer-size">{f.info}</span>
            </div>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => handlePull(f.name)}
              disabled={listing.pulling === f.name}
            >
              {listing.pulling === f.name ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        ))}
    </div>
  )
}
