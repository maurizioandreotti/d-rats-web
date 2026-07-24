import { useConfigStore } from '../store/config-store'
import { useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

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
  const myPos = config.myPosition

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
      <h2>Configuration</h2>

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
        <button className="btn btn-secondary" onClick={() => setShowPicker(true)}>
          Pick on Map
        </button>
        <div className="form-row">
          <label htmlFor="mapLat">Default Latitude</label>
          <input
            id="mapLat"
            type="number"
            step="0.01"
            value={config.mapCenter[0]}
            onChange={(e) =>
              updateConfig({ mapCenter: [Number(e.target.value), config.mapCenter[1]] })
            }
          />
        </div>
        <div className="form-row">
          <label htmlFor="mapLon">Default Longitude</label>
          <input
            id="mapLon"
            type="number"
            step="0.01"
            value={config.mapCenter[1]}
            onChange={(e) =>
              updateConfig({ mapCenter: [config.mapCenter[0], Number(e.target.value)] })
            }
          />
        </div>
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

      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pick your position on the map</h3>
              <button className="btn btn-sm" onClick={() => setShowPicker(false)}>Close</button>
            </div>
            <div className="modal-map">
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
            <p className="note">Click anywhere on the map to set your position.</p>
          </div>
        </div>
      )}
    </div>
  )
}
