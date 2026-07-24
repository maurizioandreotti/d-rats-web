import { useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStationStore } from '../store/station-store'
import { useConfigStore } from '../store/config-store'
import { StationStatus } from '../types'

const ownIcon = (callsign: string) => new L.DivIcon({
  html: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:#4a90d9;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div><span style="margin-top:2px;padding:1px 4px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,0.55);border-radius:3px;white-space:nowrap;line-height:1.3;">${callsign}</span></div>`,
  iconSize: [28, 44],
  iconAnchor: [14, 32],
  popupAnchor: [0, -32],
  className: '',
})

const stationIcon = (callsign: string) => new L.DivIcon({
  html: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:#e8a838;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div><span style="margin-top:2px;padding:1px 4px;font-size:10px;font-weight:600;color:#fff;background:rgba(0,0,0,0.55);border-radius:3px;white-space:nowrap;line-height:1.3;">${callsign}</span></div>`,
  iconSize: [28, 44],
  iconAnchor: [14, 32],
  popupAnchor: [0, -32],
  className: '',
})

function MapController() {
  const map = useMap()
  const myPosition = useConfigStore((s) => s.config.myPosition)
  const focusCenter = useConfigStore((s) => s.config.focusCenter)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const prevPos = useRef(myPosition)

  useEffect(() => {
    if (myPosition && myPosition !== prevPos.current) {
      map.setView([myPosition.lat, myPosition.lon], map.getZoom())
      prevPos.current = myPosition
    }
  }, [myPosition, map])

  useEffect(() => {
    if (focusCenter) {
      map.setView(focusCenter, 12)
      updateConfig({ focusCenter: undefined })
    }
  }, [focusCenter, map, updateConfig])

  useMapEvents({
    moveend() {
      const c = map.getCenter()
      const z = map.getZoom()
      updateConfig({ mapCenter: [c.lat, c.lng], mapZoom: z })
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
            const position = { lat: pos.coords.latitude, lon: pos.coords.longitude, timestamp: Date.now() }
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
  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)

  const myPosition = config.myPosition
  const stationList = Object.values(stations).filter((s) => s.position)

  const handleDragEnd = useCallback((e: L.LeafletEvent) => {
    const marker = e.target
    const pos = marker.getLatLng()
    updateConfig({ myPosition: { lat: pos.lat, lon: pos.lng, timestamp: Date.now() } })
  }, [updateConfig])

  return (
    <div>
      <h2>Map</h2>
      <div className="map-container">
        <MapContainer
          center={myPosition ? [myPosition.lat, myPosition.lon] : config.mapCenter}
          zoom={config.mapZoom}
          className="map-inner"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController />
          <LocateButton />

          {myPosition && (
            <Marker
              position={[myPosition.lat, myPosition.lon]}
              icon={ownIcon(config.myCallsign || 'ME')}
              draggable={true}
              eventHandlers={{ dragend: handleDragEnd }}
            >
              <Popup>
                <strong>{config.myCallsign || 'My Position'}</strong>
                <br />
                {myPosition.lat.toFixed(4)}, {myPosition.lon.toFixed(4)}
                <br />
                <em>Drag to adjust</em>
              </Popup>
            </Marker>
          )}

          {stationList.map((s) => (
            <Marker key={s.callsign} position={[s.position!.lat, s.position!.lon]} icon={stationIcon(s.callsign)}>
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
        Drag marker to adjust position, or use the 📍 button for GPS location.
        Set coordinates in the Config tab.
      </p>
    </div>
  )
}
