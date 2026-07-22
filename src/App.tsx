import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { RadioSerial } from './engine/serial'
import { useSnifferStore } from './store/sniffer-store'
import './App.css'

function App() {
  useEffect(() => {
    const cb = (direction: 'rx' | 'tx', data: Uint8Array) => {
      useSnifferStore.getState().addPacket(direction, data)
    }
    RadioSerial.addSniffListener(cb)
    return () => {
      RadioSerial.removeSniffListener(cb)
    }
  }, [])

  return <Layout />
}

export default App
