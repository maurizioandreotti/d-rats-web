import { useState, useCallback } from 'react'
import { useDratsEngine } from '../hooks/useDratsEngine'
import { usePortStore } from '../store/port-store'
import { useConfigStore } from '../store/config-store'
import { useStationStore } from '../store/station-store'
import { SerialConnect } from './SerialConnect'
import { ChatPanel } from './ChatPanel'
import { MapPanel } from './MapPanel'
import { FileTransfer } from './FileTransfer'
import { StationsList } from './StationsList'
import { EventLog } from './EventLog'
import { ConfigPanel } from './ConfigPanel'
import { SnifferPanel } from './SnifferPanel'
import { PingPanel } from './PingPanel'
import { WikiPanel } from './WikiPanel'

interface TabDef {
  id: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'radio', label: 'Radio' },
  { id: 'chat', label: 'Chat' },
  { id: 'files', label: 'Files' },
  { id: 'ping', label: 'Pings' },
  { id: 'map', label: 'Map' },
  { id: 'events', label: 'Events' },
  { id: 'sniffer', label: 'Sniffer' },
  { id: 'config', label: 'Config' },
  { id: 'wiki', label: 'Wiki' },
]

export function Layout() {
  const [activeTab, setActiveTab] = useState('radio')
  const {
    chatRef,
    sessionMgrRef,
    connectPort,
    disconnectPort,
  } = useDratsEngine()

  const portStatuses = usePortStore((s) => s.statuses)
  const config = useConfigStore((s) => s.config)
  const stations = useStationStore((s) => s.stations)

  const connectedPorts = config.ports.filter((p) => portStatuses[p.name] === 'connected')
  const connectedCount = connectedPorts.length
  const totalPorts = config.ports.length

  const handleShowOnMap = useCallback((callsign: string) => {
    const station = stations[callsign]
    if (station?.position) {
      useConfigStore.getState().updateConfig({
        focusCenter: [station.position.lat, station.position.lon],
      })
    }
    setActiveTab('map')
  }, [stations])

  const statusItems = connectedPorts.map((p) => {
    const detail = p.type === 'serial' ? `${p.settings} baud` : `${p.ratflector?.host}:${p.ratflector?.port}`
    return `${p.name}@${detail}`
  })

  const renderContent = () => {
    switch (activeTab) {
      case 'radio':
        return (
          <SerialConnect
            onConnect={connectPort}
            onDisconnect={disconnectPort}
          />
        )
      case 'sniffer':
        return <SnifferPanel />
      case 'chat':
        return <ChatPanel chatRef={chatRef} />
      case 'ping':
        return <PingPanel />
      case 'map':
        return <MapPanel />
      case 'files':
        return <FileTransfer />
      case 'events':
        return <EventLog />
      case 'wiki':
        return <WikiPanel />
      case 'config':
        return <ConfigPanel />
      default:
        return null
    }
  }

  return (
    <div className="app-layout">
      <aside className="stations-panel">
        <div className="stations-panel-header">
          <h2>Stations</h2>
        </div>
        <div className="stations-panel-content">
          <StationsList chatRef={chatRef} sessionMgrRef={sessionMgrRef} onShowOnMap={handleShowOnMap} />
        </div>
      </aside>

      <div className="main-panel">
        <nav className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="tab-content">{renderContent()}</main>

        <footer className="status-bar">
          <span className="status-text">D-RATS Web v0.1.0</span>
          {connectedCount > 0 ? (
            <span className="status-ports">
              <span className="status-dot online" />
              {connectedCount}/{totalPorts} connected — {statusItems.join(' | ')}
            </span>
          ) : totalPorts > 0 ? (
            <span className="status-ports">
              <span className="status-dot unknown" />
              {totalPorts} port{totalPorts > 1 ? 's' : ''} — none connected
            </span>
          ) : (
            <span className="status-ports">No ports configured</span>
          )}
        </footer>
      </div>
    </div>
  )
}
