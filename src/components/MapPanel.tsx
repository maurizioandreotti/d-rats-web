import { useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStationStore } from '../store/station-store'
import { useConfigStore } from '../store/config-store'
import { StationStatus } from '../types'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9/dist/images/marker-shadow.png',
})

const ownIcon = new L.DivIcon({
  html: '<div style="background:#4a90d9;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
  className: '',
})

function MapController() {
  const map = useMap()
  const ownPosition = useStationStore((s) => s.ownPosition)
  const setOwnPosition = useStationStore((s) => s.setOwnPosition)
  const prevPos = useRef(ownPosition)
  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const initializedPos = useRef(false)

  useEffect(() => {
    if (config.myPosition && !ownPosition && !initializedPos.current) {
      setOwnPosition(config.myPosition)
    }
    initializedPos.current = true
  }, [])

  useEffect(() => {
    if (ownPosition && ownPosition !== prevPos.current) {
      map.setView([ownPosition.lat, ownPosition.lon], map.getZoom())
      prevPos.current = ownPosition
      updateConfig({ myPosition: ownPosition })
    }
  }, [ownPosition, map, updateConfig])

  useMapEvents({
    moveend() {
      const c = map.getCenter()
      const z = map.getZoom()
      updateConfig({ mapCenter: [c.lat, c.lng], mapZoom: z })
    },
  })

  return null
}

function MapClickHandler() {
  useMapEvents({
    click(e) {
      useStationStore.getState().setOwnPosition({ lat: e.latlng.lat, lon: e.latlng.lng })
      useConfigStore.getState().updateConfig({ myPosition: { lat: e.latlng.lat, lon: e.latlng.lng } })
    },
  })
  return null
}

function LocateButton() {
  const map = useMap()

  useEffect(() => {
    const btn = new L.Control({ position: 'topleft' })
    btn.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
      div.innerHTML = '<a href="#" title="Locate me" style="font-size:18px;line-height:30px;text-align:center;display:block;width:30px;height:30px;">📍</a>'
      div.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude
            const lon = pos.coords.longitude
            const position = { lat, lon, timestamp: Date.now() }
            useStationStore.getState().setOwnPosition(position)
            useConfigStore.getState().updateConfig({ myPosition: position })
          },
          (err) => {
            console.warn('[MapPanel] Geolocation error:', err.message)
            alert('Could not get your location. Check browser permissions.')
          },
          { enableHighAccuracy: true, timeout: 10000 },
        )
      }
      return div
    }
    btn.addTo(map)
    return () => { btn.remove() }
  }, [map])

  return null
}

const STATUS_LABEL: Record<number, string> = {
  [StationStatus.Unknown]: 'Unknown',
  [StationStatus.Online]: 'Online',
  [StationStatus.Unattended]: 'Unattended',
  [StationStatus.Offline]: 'Offline',
}

export function MapPanel() {
  const stations = useStationStore((s) => s.stations)
  const ownPosition = useStationStore((s) => s.ownPosition)
  const setOwnPosition = useStationStore((s) => s.setOwnPosition)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const config = useConfigStore((s) => s.config)

  const stationList = Object.values(stations).filter((s) => s.position)

  const handleDragEnd = useCallback((e: L.LeafletEvent) => {
    const marker = e.target
    const pos = marker.getLatLng()
    const position = { lat: pos.lat, lon: pos.lng, timestamp: Date.now() }
    setOwnPosition(position)
    updateConfig({ myPosition: position })
  }, [setOwnPosition, updateConfig])

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
          <MapController />
          <MapClickHandler />
          <LocateButton />

          {ownPosition && (
            <Marker
              position={[ownPosition.lat, ownPosition.lon]}
              icon={ownIcon}
              draggable={true}
              eventHandlers={{ dragend: handleDragEnd }}
            >
              <Popup>
                <strong>My Position</strong>
                <br />
                {ownPosition.lat.toFixed(4)}, {ownPosition.lon.toFixed(4)}
                <br />
                <em>Drag to adjust, or click anywhere on the map</em>
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
                Status: {STATUS_LABEL[s.status] ?? 'Unknown'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="legend">
        <span className="legend-dot own" /> My Position
        <span className="legend-dot station" /> Stations
      </div>

      <p className="note">
        Click on the map to place your position, or use the 📍 button for GPS location.
      </p>
    </div>
  )
}
