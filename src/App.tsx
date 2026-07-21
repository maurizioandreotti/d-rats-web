import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { RadioSerial } from './engine/serial'
import { useSnifferStore } from './store/sniffer-store'
import './App.css'

function App() {
  useEffect(() => {
    RadioSerial.onSniff = (direction, data) => {
      useSnifferStore.getState().addPacket(direction, data)
    }
    return () => {
      RadioSerial.onSniff = null
    }
  }, [])

  return <Layout />
}

export default App
