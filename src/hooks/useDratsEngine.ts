import { useCallback, useRef } from 'react'
import type { PortConfig } from '../types'
import { SessionManager } from '../engine/session-mgr'
import { ChatEngine } from '../engine/chat'
import { FileTransferEngine } from '../engine/file'
import { TransportManager } from '../engine/transport-manager'
import { useChatStore } from '../store/chat-store'
import { usePingStore } from '../store/ping-store'
import { useStationStore } from '../store/station-store'
import { useFileStore } from '../store/file-store'
import { useConfigStore } from '../store/config-store'
import type { DDT2Frame } from '../types'
import { StationStatus } from '../types'

export function useDratsEngine() {
  const transportMgrRef = useRef<TransportManager | null>(null)
  const sessionMgrRef = useRef<SessionManager | null>(null)
  const chatRef = useRef<ChatEngine | null>(null)
  const fileRef = useRef<FileTransferEngine | null>(null)
  const initializedRef = useRef(false)
  const activePortRef = useRef('')

  const addChatMessage = useChatStore((s) => s.addMessage)
  const addPing = usePingStore((s) => s.addPing)
  const { updateStation, setStationPosition } = useStationStore()
  const { addTransfer, updateTransfer } = useFileStore()
  const config = useConfigStore((s) => s.config)

  const handleFrame = useCallback(
    async (frame: DDT2Frame, portName: string) => {
      const sessionMgr = sessionMgrRef.current
      if (sessionMgr) {
        sessionMgr.heardOnPort(frame.header.sourceStation, portName)
        await sessionMgr.incoming(frame)
      }
    },
    [],
  )

  const initEngine = useCallback(() => {
    if (initializedRef.current) return

    const transportMgr = new TransportManager()
    transportMgrRef.current = transportMgr

    const sessionMgr = new SessionManager()
    sessionMgr.setStation(config.myCallsign || 'N0CALL')
    sessionMgrRef.current = sessionMgr

    const chat = new ChatEngine(sessionMgr)
    chat.setPingInfo(config.pingInfo)
    chat.setOnMessage((from, to, text) => {
      const id = crypto.randomUUID()
      addChatMessage({ id, from, to, text, timestamp: Date.now(), direction: 'incoming' })
    })
    chat.setOnPing((from, to, type, data) => {
      addPing({ from, to, type: type as 'request' | 'response' | 'echo_request' | 'echo_response', data, timestamp: Date.now() })
    })
    chat.setOnGpsFix((from, lat, lon) => {
      setStationPosition(from, { lat, lon, timestamp: Date.now() })
    })
    chat.setOnStatus((from, status) => {
      updateStation(from, { status: status as StationStatus, lastHeard: Date.now() })
    })
    chatRef.current = chat

    const fileTransfer = new FileTransferEngine(sessionMgr)
    fileTransfer.setOnOffer((filename, size, sessionId) => {
      const id = crypto.randomUUID()
      addTransfer({ id, filename, size, transferred: 0, direction: 'receive', state: 'offer', station: String(sessionId) })
    })
    fileTransfer.setOnProgress((filename, transferred, total) => {
      const store = useFileStore.getState()
      const existing = store.transfers.find((t) => t.filename === filename)
      if (existing) {
        updateTransfer(existing.id, { transferred, state: transferred >= total ? 'complete' : 'transferring' })
      }
    })
    fileRef.current = fileTransfer

    transportMgr.setOnFrame(handleFrame)

    sessionMgr.setOutgoingCallback(async (frame: DDT2Frame, portName?: string) => {
      const mgr = transportMgrRef.current
      if (!mgr) return
      const port = portName || activePortRef.current
      await mgr.sendFrame(frame, port || undefined)
    })

    initializedRef.current = true
  }, [config.myCallsign, config.pingInfo, addChatMessage, addPing, updateStation, setStationPosition, addTransfer, updateTransfer, handleFrame])

  const connectPort = useCallback(
    async (name: string, config: PortConfig) => {
      initEngine()
      const mgr = transportMgrRef.current
      if (!mgr) return

      if (config.type === 'serial') {
        await mgr.connectSerial(name, config)
      } else if (config.type === 'ratflector') {
        await mgr.connectRatflector(name, config)
      }

      // Broadcast sign-on status
      const appConfig = useConfigStore.getState().config
      chatRef.current?.sendStatus(appConfig.signOnMessage || 'Online (D-RATS Web)')
    },
    [initEngine],
  )

  const disconnectPort = useCallback(async (name: string) => {
    const mgr = transportMgrRef.current
    await mgr?.disconnect(name)
    if (activePortRef.current === name) {
      activePortRef.current = ''
    }
  }, [])

  const setActivePort = useCallback((name: string) => {
    activePortRef.current = name
  }, [])

  return {
    transportMgrRef,
    sessionMgrRef,
    chatRef,
    fileRef,
    connectPort,
    disconnectPort,
    setActivePort,
  } as const
}
