import { useConfigStore } from '../store/config-store'
import { useLocalFilesStore } from '../store/local-files-store'
import { isSupported as folderPickerSupported } from '../engine/local-files'
import { useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { toMaidenhead } from '../engine/gps'

function PickerMap({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function ConfigPanel() {
  const { config, updateConfig, resetConfig } = useConfigStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const myPos = config.myPosition

  const handleApply = useCallback(() => {
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 2000)
  }, [])

  const folderName = useLocalFilesStore((s) => s.folderName)
  const folderPermission = useLocalFilesStore((s) => s.permission)
  const pickFolder = useLocalFilesStore((s) => s.pick)
  const reconnectFolder = useLocalFilesStore((s) => s.reconnect)

  const handleExport = () => {
    const json = JSON.stringify(config, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'd-rats-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        updateConfig(parsed)
      } catch (err) {
        console.error('[ConfigPanel] Failed to parse config file:', err)
        alert('Invalid configuration file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const setLat = useCallback((lat: number) => {
    const lon = config.myPosition?.lon ?? config.mapCenter[1]
    updateConfig({ myPosition: { lat, lon, timestamp: Date.now() } })
  }, [config, updateConfig])

  const setLon = useCallback((lon: number) => {
    const lat = config.myPosition?.lat ?? config.mapCenter[0]
    updateConfig({ myPosition: { lat, lon, timestamp: Date.now() } })
  }, [config, updateConfig])

  const handlePick = useCallback((lat: number, lon: number) => {
    updateConfig({ myPosition: { lat, lon, timestamp: Date.now() } })
    setShowPicker(false)
  }, [updateConfig])

  return (
    <div>
      <div className="panel-header">
        <h2>Configuration</h2>
        <div className="config-apply-row">
          {showSaved && <span className="config-saved-badge">✓ Saved</span>}
          <button className="btn btn-primary btn-sm" onClick={handleApply}>Apply</button>
        </div>
      </div>
      <p className="help-text">Changes save automatically as you type — Apply just confirms the current values are saved.</p>

      <div className="panel-card">
        <h3>Station</h3>
        <div className="form-row">
          <label htmlFor="callsign">Callsign</label>
          <input
            id="callsign"
            type="text"
            value={config.myCallsign}
            onChange={(e) => updateConfig({ myCallsign: e.target.value.toUpperCase() })}
            placeholder="N0CALL"
            maxLength={8}
          />
        </div>
        <div className="form-row">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={config.myName}
            onChange={(e) => updateConfig({ myName: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <div className="form-row">
          <label htmlFor="signon">Sign-on Message</label>
          <input
            id="signon"
            type="text"
            value={config.signOnMessage}
            onChange={(e) => updateConfig({ signOnMessage: e.target.value })}
            placeholder="e.g. D-RATS Web online"
          />
        </div>
        <div className="form-row">
          <label htmlFor="signoff">Sign-off Message</label>
          <input
            id="signoff"
            type="text"
            value={config.signOffMessage}
            onChange={(e) => updateConfig({ signOffMessage: e.target.value })}
            placeholder="e.g. D-RATS Web offline"
          />
        </div>
        <div className="form-row">
          <label htmlFor="pinginfo">Ping Reply</label>
          <input
            id="pinginfo"
            type="text"
            value={config.pingInfo}
            onChange={(e) => updateConfig({ pingInfo: e.target.value })}
            placeholder="e.g. Running D-RATS Web"
          />
        </div>
        <div className="form-row">
          <label htmlFor="autoconnect">Auto-Connect at Launch</label>
          <input
            id="autoconnect"
            type="checkbox"
            checked={config.autoConnect}
            onChange={(e) => updateConfig({ autoConnect: e.target.checked })}
          />
        </div>
      </div>

      <div className="panel-card">
        <h3>Appearance</h3>
        <div className="form-row">
          <label htmlFor="units">Units</label>
          <select
            id="units"
            value={config.units}
            onChange={(e) => updateConfig({ units: e.target.value as 'imperial' | 'metric' })}
          >
            <option value="imperial">Imperial</option>
            <option value="metric">Metric</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="utc">Show Time in UTC</label>
          <input
            id="utc"
            type="checkbox"
            checked={config.showUtc}
            onChange={(e) => updateConfig({ showUtc: e.target.checked })}
          />
        </div>
      </div>

      <div className="panel-card">
        <h3>Map</h3>
        <div className="form-row">
          <label htmlFor="myLat">My Latitude</label>
          <input
            id="myLat"
            type="number"
            step="0.0001"
            value={myPos?.lat ?? ''}
            onChange={(e) => setLat(Number(e.target.value))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="myLon">My Longitude</label>
          <input
            id="myLon"
            type="number"
            step="0.0001"
            value={myPos?.lon ?? ''}
            onChange={(e) => setLon(Number(e.target.value))}
          />
        </div>
        {myPos && (
          <div className="form-row">
            <label>QTH Locator</label>
            <span>{toMaidenhead(myPos.lat, myPos.lon)}</span>
          </div>
        )}
        {!showPicker ? (
          <button className="btn btn-secondary" onClick={() => setShowPicker(true)}>
            Pick on Map
          </button>
        ) : (
          <div className="inline-map-picker">
            <div className="inline-map-picker-header">
              <span>Click anywhere on the map to set your position.</span>
              <button className="btn btn-sm" onClick={() => setShowPicker(false)}>Close</button>
            </div>
            <div className="inline-map-picker-map">
              <MapContainer
                center={myPos ? [myPos.lat, myPos.lon] : config.mapCenter}
                zoom={config.mapZoom}
                className="map-inner"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <PickerMap onPick={handlePick} />
              </MapContainer>
            </div>
          </div>
        )}
        <div className="form-row">
          <label htmlFor="mapZoom">Default Zoom</label>
          <input
            id="mapZoom"
            type="number"
            min="1"
            max="19"
            value={config.mapZoom}
            onChange={(e) => updateConfig({ mapZoom: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="panel-card">
        <h3>File Transfer</h3>
        <div className="form-row">
          <label>Shared Folder</label>
          {!folderPickerSupported() ? (
            <span className="help-text">Not supported in this browser — try Chrome or Edge.</span>
          ) : folderName ? (
            <>
              <span>{folderName}</span>
              {folderPermission === 'needs-permission' && (
                <button className="btn btn-sm" onClick={() => void reconnectFolder()}>Reconnect</button>
              )}
              <button className="btn btn-sm btn-secondary" onClick={() => void pickFolder()}>Change…</button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => void pickFolder()}>Choose Folder…</button>
          )}
        </div>
        <p className="help-text">The folder listed in the Files tab's Local pane and served to other stations.</p>
        <div className="form-row">
          <label htmlFor="allow-remote-files">Remote file transfers</label>
          <input
            id="allow-remote-files"
            type="checkbox"
            checked={config.allowRemoteFileTransfers}
            onChange={(e) => updateConfig({ allowRemoteFileTransfers: e.target.checked })}
          />
        </div>
        <p className="help-text">Allow remote stations to pull files from your Local folder.</p>
        <div className="form-row">
          <label htmlFor="delete-passwd">Remote Delete Password</label>
          <input
            id="delete-passwd"
            type="password"
            value={config.remoteDeletePassword}
            onChange={(e) => updateConfig({ remoteDeletePassword: e.target.value })}
            placeholder="Blank disables remote delete"
          />
        </div>
      </div>

      <div className="button-row">
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="btn btn-secondary" onClick={handleExport}>
          Export Config
        </button>
        <button className="btn btn-secondary" onClick={handleImport}>
          Load Config
        </button>
        <button className="btn btn-secondary" onClick={resetConfig}>
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
