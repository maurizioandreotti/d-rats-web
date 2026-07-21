import { useConfigStore } from '../store/config-store'

export function ConfigPanel() {
  const { config, updateConfig, resetConfig } = useConfigStore()

  return (
    <div>
      <h2>Configuration</h2>

      <div className="panel-card">
        <h3>Callsign</h3>
        <div className="form-row">
          <label htmlFor="callsign">My Callsign</label>
          <input
            id="callsign"
            type="text"
            value={config.myCallsign}
            onChange={(e) => updateConfig({ myCallsign: e.target.value.toUpperCase() })}
            placeholder="N0CALL"
            maxLength={8}
          />
        </div>
      </div>

      <div className="panel-card">
        <h3>Serial Port</h3>
        <div className="form-row">
          <label htmlFor="baud">Baud Rate</label>
          <select
            id="baud"
            value={config.serial.baudRate}
            onChange={(e) =>
              updateConfig({ serial: { ...config.serial, baudRate: Number(e.target.value) } })
            }
          >
            <option value="4800">4800</option>
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
            <option value="57600">57600</option>
            <option value="115200">115200</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="parity">Parity</label>
          <select
            id="parity"
            value={config.serial.parity}
            onChange={(e) =>
              updateConfig({ serial: { ...config.serial, parity: e.target.value as 'none' | 'even' | 'odd' } })
            }
          >
            <option value="none">None</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </select>
        </div>
      </div>

      <div className="panel-card">
        <h3>Map</h3>
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
        <button className="btn btn-secondary" onClick={resetConfig}>
          Reset to Defaults
        </button>
      </div>
    </div>
  )
}
