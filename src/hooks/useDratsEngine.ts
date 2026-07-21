import { useCallback, useRef } from 'react'
import { RadioSerial } from '../engine/serial'
import { Transport } from '../engine/transport'
import { SessionManager } from '../engine/session-mgr'
import { ChatEngine } from '../engine/chat'
import { FileTransferEngine } from '../engine/file'
import { parseGps } from '../engine/gps'
import { useChatStore } from '../store/chat-store'
import { useStationStore } from '../store/station-store'
import { useFileStore } from '../store/file-store'
import { useConfigStore } from '../store/config-store'
import type { DDT2Frame } from '../types'
import { StationStatus } from '../types'

export interface DratsEngine {
  serial: RadioSerial | null
  transport: Transport | null
  sessionManager: SessionManager | null
  chat: ChatEngine | null
  fileTransfer: FileTransferEngine | null
}

export function useDratsEngine() {
  const serialRef = useRef<RadioSerial | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const sessionMgrRef = useRef<SessionManager | null>(null)
  const chatRef = useRef<ChatEngine | null>(null)
  const fileRef = useRef<FileTransferEngine | null>(null)
  const initializedRef = useRef(false)

  const addChatMessage = useChatStore((s) => s.addMessage)
  const { updateStation, setStationPosition, setOwnPosition } = useStationStore()
  const { addTransfer, updateTransfer } = useFileStore()
  const config = useConfigStore((s) => s.config)

  const initEngine = useCallback(() => {
    if (initializedRef.current) return

    const sessionMgr = new SessionManager()
    sessionMgr.setStation(config.myCallsign || 'N0CALL')
    sessionMgrRef.current = sessionMgr

    const chat = new ChatEngine(sessionMgr)
    chat.setOnMessage((from, to, text) => {
      const id = crypto.randomUUID()
      addChatMessage({ id, from, to, text, timestamp: Date.now(), direction: 'incoming' })
    })
    chat.setOnGpsFix((from, lat, lon) => {
      setStationPosition(from, { lat, lon, timestamp: Date.now() })
    })
    chat.setOnPingRequest((from, to) => {
      const id = crypto.randomUUID()
      addChatMessage({ id, from, to, text: `[Ping from ${from}]`, timestamp: Date.now(), direction: 'incoming' })
    })
    chat.setOnPingResponse((from, to, data) => {
      const id = crypto.randomUUID()
      addChatMessage({ id, from, to, text: `[Pong from ${from}: ${data}]`, timestamp: Date.now(), direction: 'incoming' })
    })
    chat.setOnStatus((from, status) => {
      updateStation(from, { status: status as StationStatus, lastHeard: Date.now() })
    })
    chatRef.current = chat

    const fileTransfer = new FileTransferEngine(sessionMgr)
    fileTransfer.setOnOffer((filename, size) => {
      const id = crypto.randomUUID()
      addTransfer({ id, filename, size, transferred: 0, direction: 'receive', state: 'offer', station: '' })
    })
    fileTransfer.setOnProgress((filename, transferred, total) => {
      const store = useFileStore.getState()
      const existing = store.transfers.find((t) => t.filename === filename)
      if (existing) {
        updateTransfer(existing.id, { transferred, state: transferred >= total ? 'complete' : 'transferring' })
      }
    })
    fileRef.current = fileTransfer

    sessionMgr.setOutgoingCallback(async (frame: DDT2Frame) => {
      const transport = transportRef.current
      if (transport) {
        await transport.sendFrame(frame)
      }
    })

    initializedRef.current = true
  }, [config.myCallsign, addChatMessage, updateStation, setStationPosition, addTransfer, updateTransfer])

  const onSerialConnected = useCallback(() => {
    initEngine()

    const serial = serialRef.current
    if (!serial) return

    const transport = new Transport(serial)
    transportRef.current = transport

    transport.setOnFrame(async (frame) => {
      const sessionMgr = sessionMgrRef.current
      if (sessionMgr) {
        await sessionMgr.incoming(frame)
      }
    })

    transport.setOnGpsString((text) => {
      const fix = parseGps(text)
      if (fix) {
        setOwnPosition(fix)
      }
    })

    transport.setOnRawText((text) => {
      const fix = parseGps(text)
      if (fix) {
        setOwnPosition(fix)
      }
    })
  }, [initEngine, setOwnPosition])

  const onSerialDisconnected = useCallback(() => {
    transportRef.current = null
  }, [])

  return {
    serialRef,
    transportRef,
    sessionMgrRef,
    chatRef,
    fileRef,
    onSerialConnected,
    onSerialDisconnected,
  }
}
