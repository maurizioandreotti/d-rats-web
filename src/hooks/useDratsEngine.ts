import { useCallback, useRef, useEffect } from 'react'
import type { PortConfig } from '../types'
import { SessionManager } from '../engine/session-mgr'
import { ChatEngine } from '../engine/chat'
import { FileTransferEngine } from '../engine/file'
import { RPCEngine } from '../engine/rpc'
import { isValidCallsign } from '../engine/callsign'
import { TransportManager } from '../engine/transport-manager'
import { SESSION_CONTROL, SESSION_CHAT, SESSION_RPC } from '../engine/ddt2'
import { useChatStore } from '../store/chat-store'
import { usePingStore } from '../store/ping-store'
import { useStationStore } from '../store/station-store'
import { useFileStore } from '../store/file-store'
import { useSharedFilesStore } from '../store/shared-files-store'
import { useConfigStore } from '../store/config-store'
import { useEventStore } from '../store/event-store'
import { formatFileSize } from '../utils/format'
import type { DDT2Frame } from '../types'
import { StationStatus } from '../types'

export function useDratsEngine() {
  const transportMgrRef = useRef<TransportManager | null>(null)
  const sessionMgrRef = useRef<SessionManager | null>(null)
  const chatRef = useRef<ChatEngine | null>(null)
  const fileRef = useRef<FileTransferEngine | null>(null)
  const rpcRef = useRef<RPCEngine | null>(null)
  const initializedRef = useRef(false)

  const addChatMessage = useChatStore((s) => s.addMessage)
  const addPing = usePingStore((s) => s.addPing)
  const { updateStation, setStationPosition } = useStationStore()
  const { addTransfer, updateTransfer } = useFileStore()
  const config = useConfigStore((s) => s.config)

  const handleFrame = useCallback(
    async (frame: DDT2Frame, portName: string) => {
      // A frame whose source station doesn't look like a real callsign is
      // almost certainly corrupted (e.g. a checksum-mismatched frame that
      // still decoded "successfully") — don't let it pollute heard-station
      // tracking or get attributed as a real sender downstream.
      if (!isValidCallsign(frame.header.sourceStation)) return

      const sessionMgr = sessionMgrRef.current
      if (sessionMgr) {
        sessionMgr.heardOnPort(frame.header.sourceStation, portName)
        await sessionMgr.incoming(frame)
      }

      useStationStore.getState().updateStation(frame.header.sourceStation, {
        lastHeard: Date.now(),
      })

      const { sessionId } = frame.header
      if (sessionId === SESSION_CONTROL) return

      const direction = frame.header.sourceStation !== config.myCallsign ? 'incoming' : 'outgoing'

      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Frame] ${direction === 'incoming' ? '←' : '→'} session=${sessionId} ${frame.header.sourceStation} → ${frame.header.destStation}`,
        type: 'frame',
      })

      if (sessionId === SESSION_CHAT) {
        await chatRef.current?.handleIncoming(frame)
      } else if (sessionId === SESSION_RPC) {
        await rpcRef.current?.handleIncoming(frame)
      } else {
        await fileRef.current?.handleIncoming(frame)
      }
    },
    [config.myCallsign],
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
      addChatMessage({ id, from, to, text, timestamp: Date.now(), direction: 'incoming', type: 'chat' })
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Chat] ← ${from} → ${to}: ${text.substring(0, 80)}`,
        type: 'chat-in',
      })
    })
    chat.setOnPing((from, to, type, data) => {
      addPing({ from, to, type: type as 'request' | 'response' | 'echo_request' | 'echo_response', data, timestamp: Date.now() })
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Ping] ${from} → ${to} (${type})`,
        type: 'ping',
      })
    })
    chat.setOnGpsFix((from, lat, lon) => {
      setStationPosition(from, { lat, lon, timestamp: Date.now() })
    })
    chat.setOnStatus((from, status) => {
      updateStation(from, { status: status as StationStatus, lastHeard: Date.now() })
    })
    chatRef.current = chat

    const fileTransfer = new FileTransferEngine(sessionMgr)
    fileTransfer.setOnOffer((filename, size, sessionId, fromStation) => {
      const id = crypto.randomUUID()
      addTransfer({ id, sessionId, filename, size, transferred: 0, direction: 'receive', state: 'offer', station: fromStation })
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[File] Offer from ${fromStation}: ${filename} (${size} bytes)`,
        type: 'frame',
      })
    })
    fileTransfer.setOnProgress((_filename, transferred, total, sessionId) => {
      const store = useFileStore.getState()
      const existing = store.transfers.find((t) => t.sessionId === sessionId)
      if (existing) {
        updateTransfer(existing.id, { transferred, state: transferred >= total ? 'complete' : 'transferring' })
      }
    })
    fileRef.current = fileTransfer

    const rpc = new RPCEngine(sessionMgr)
    rpc.setFileTransferEngine(fileTransfer)
    rpc.setFileProvider({
      list: () =>
        useSharedFilesStore.getState().files.map((f) => ({
          name: f.name,
          info: `${formatFileSize(f.size)} (${new Date(f.addedAt).toLocaleString()})`,
        })),
      get: (name) => useSharedFilesStore.getState().files.find((f) => f.name === name)?.data ?? null,
    })
    rpcRef.current = rpc

    transportMgr.setOnFrame(handleFrame)

    sessionMgr.setOutgoingCallback(async (frame: DDT2Frame, portName?: string) => {
      const mgr = transportMgrRef.current
      if (!mgr) return
      await mgr.sendFrame(frame, portName)
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
  }, [])

  const autoConnectRan = useRef(false)

  useEffect(() => {
    if (autoConnectRan.current) return
    if (!config.autoConnect) return

    const enabledPorts = config.ports.filter((p) => p.enabled)
    if (enabledPorts.length === 0) return

    autoConnectRan.current = true
    for (const port of enabledPorts) {
      connectPort(port.name, port).catch((err) => {
        console.error(`[AutoConnect] ${port.name}:`, err)
      })
    }
  }, [config.autoConnect, config.ports, connectPort])

  return {
    transportMgrRef,
    sessionMgrRef,
    chatRef,
    fileRef,
    rpcRef,
    connectPort,
    disconnectPort,
  } as const
}