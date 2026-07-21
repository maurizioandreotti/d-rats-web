import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStationStore } from '../store/station-store'
import { useConfigStore } from '../store/config-store'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-shadow.png',
})

function MapUpdater() {
  const map = useMap()
  const ownPosition = useStationStore((s) => s.ownPosition)
  const prevPos = useRef(ownPosition)

  useEffect(() => {
    if (ownPosition && ownPosition !== prevPos.current) {
      map.setView([ownPosition.lat, ownPosition.lon], map.getZoom())
      prevPos.current = ownPosition
    }
  }, [ownPosition, map])

  return null
}

export function MapPanel() {
  const stations = useStationStore((s) => s.stations)
  const ownPosition = useStationStore((s) => s.ownPosition)
  const config = useConfigStore((s) => s.config)

  const stationList = Object.values(stations).filter((s) => s.position)

  return (
    <div>
      <h2>Map</h2>
      <div className="map-container">
        <MapContainer
          center={ownPosition ? [ownPosition.lat, ownPosition.lon] : config.mapCenter}
          zoom={config.mapZoom}
          className="map-inner"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater />

          {ownPosition && (
            <Marker position={[ownPosition.lat, ownPosition.lon]}>
              <Popup>
                <strong>My Position</strong>
                <br />
                {ownPosition.lat.toFixed(4)}, {ownPosition.lon.toFixed(4)}
              </Popup>
            </Marker>
          )}

          {stationList.map((s) => (
            <Marker key={s.callsign} position={[s.position!.lat, s.position!.lon]}>
              <Popup>
                <strong>{s.callsign}</strong>
                <br />
                {s.position!.lat.toFixed(4)}, {s.position!.lon.toFixed(4)}
                <br />
                Status: {['Unknown', 'Online', 'Unattended', '', '', '', '', '', '', 'Offline'][s.status]}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="legend">
        <span className="legend-dot own" /> My Position
        <span className="legend-dot station" /> Stations
      </div>
    </div>
  )
}
