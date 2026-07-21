import { useState } from 'react'
import { useDratsEngine } from '../hooks/useDratsEngine'
import { SerialConnect } from './SerialConnect'
import { ChatPanel } from './ChatPanel'
import { MapPanel } from './MapPanel'
import { FileTransfer } from './FileTransfer'
import { StationsList } from './StationsList'
import { EventLog } from './EventLog'
import { ConfigPanel } from './ConfigPanel'
import { SnifferPanel } from './SnifferPanel'

interface TabDef {
  id: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'radio', label: 'Radio' },
  { id: 'sniffer', label: 'Sniffer' },
  { id: 'chat', label: 'Chat' },
  { id: 'map', label: 'Map' },
  { id: 'files', label: 'Files' },
  { id: 'stations', label: 'Stations' },
  { id: 'events', label: 'Events' },
  { id: 'config', label: 'Config' },
]

export function Layout() {
  const [activeTab, setActiveTab] = useState('radio')
  const { serialRef, onSerialConnected, onSerialDisconnected } = useDratsEngine()

  const renderContent = () => {
    switch (activeTab) {
      case 'radio':
        return (
          <SerialConnect
            serial={serialRef}
            onConnected={onSerialConnected}
            onDisconnected={onSerialDisconnected}
          />
        )
      case 'sniffer':
        return <SnifferPanel />
      case 'chat':
        return <ChatPanel />
      case 'map':
        return <MapPanel />
      case 'files':
        return <FileTransfer />
      case 'stations':
        return <StationsList />
      case 'events':
        return <EventLog />
      case 'config':
        return <ConfigPanel />
      default:
        return null
    }
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>D-RATS</h1>
        </div>
        <ul className="nav-list">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main-content">{renderContent()}</main>
    </div>
  )
}
