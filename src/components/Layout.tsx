import { useState } from 'react'
import { SerialConnect } from './SerialConnect'
import { ChatPanel } from './ChatPanel'
import { MapPanel } from './MapPanel'
import { FileTransfer } from './FileTransfer'
import { StationsList } from './StationsList'
import { EventLog } from './EventLog'
import { ConfigPanel } from './ConfigPanel'

const TABS = [
  { id: 'radio', label: 'Radio', component: SerialConnect },
  { id: 'chat', label: 'Chat', component: ChatPanel },
  { id: 'map', label: 'Map', component: MapPanel },
  { id: 'files', label: 'Files', component: FileTransfer },
  { id: 'stations', label: 'Stations', component: StationsList },
  { id: 'events', label: 'Events', component: EventLog },
  { id: 'config', label: 'Config', component: ConfigPanel },
] as const

type TabId = (typeof TABS)[number]['id']

export function Layout() {
  const [activeTab, setActiveTab] = useState<TabId>('radio')

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component ?? SerialConnect

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
      <main className="main-content">
        <ActiveComponent />
      </main>
    </div>
  )
}
