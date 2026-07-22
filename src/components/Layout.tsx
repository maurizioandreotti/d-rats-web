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
import { PingPanel } from './PingPanel'

interface TabDef {
  id: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'radio', label: 'Radio' },
  { id: 'chat', label: 'Chat' },
  { id: 'files', label: 'Files' },
  { id: 'sniffer', label: 'Sniffer' },
  { id: 'ping', label: 'Pings' },
  { id: 'map', label: 'Map' },
  { id: 'events', label: 'Events' },
  { id: 'config', label: 'Config' },
]

export function Layout() {
  const [activeTab, setActiveTab] = useState('radio')
  const {
    chatRef,
    sessionMgrRef,
    connectPort,
    disconnectPort,
    setActivePort,
  } = useDratsEngine()

  const renderContent = () => {
    switch (activeTab) {
      case 'radio':
        return (
          <SerialConnect
            onConnect={connectPort}
            onDisconnect={disconnectPort}
            onPortSelected={setActivePort}
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
          <StationsList chatRef={chatRef} sessionMgrRef={sessionMgrRef} />
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
        </footer>
      </div>
    </div>
  )
}
