import { useConfigStore } from '../store/config-store'
import { useStationStore } from '../store/station-store'
import { useEffect } from 'react'

export function ConfigPanel() {
  const { config, updateConfig, resetConfig } = useConfigStore()
  const ownPosition = useStationStore((s) => s.ownPosition)
  const setOwnPosition = useStationStore((s) => s.setOwnPosition)

  useEffect(() => {
    if (ownPosition) {
      const { lat, lon } = ownPosition
      if (config.myPosition?.lat !== lat || config.myPosition?.lon !== lon) {
        updateConfig({ myPosition: { lat, lon, timestamp: Date.now() } })
      }
    }
  }, [ownPosition, config.myPosition, updateConfig])

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
            value={ownPosition?.lat ?? config.mapCenter[0]}
            onChange={(e) => {
              const lat = Number(e.target.value)
              const lon = ownPosition?.lon ?? config.mapCenter[1]
              setOwnPosition({ lat, lon })
            }}
          />
        </div>
        <div className="form-row">
          <label htmlFor="myLon">My Longitude</label>
          <input
            id="myLon"
            type="number"
            step="0.0001"
            value={ownPosition?.lon ?? config.mapCenter[1]}
            onChange={(e) => {
              const lon = Number(e.target.value)
              const lat = ownPosition?.lat ?? config.mapCenter[0]
              setOwnPosition({ lat, lon })
            }}
          />
        </div>
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
        <p className="note">
          My Position is set on the Map tab (click, drag, or 📍 button).
          Default center is used when no position is set.
        </p>
      </div>

      <div className="button-row">
        <button className="btn btn-secondary" onClick={resetConfig}>
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
