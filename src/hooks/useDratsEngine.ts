import { useCallback, useRef, useEffect } from 'react'
import type { PortConfig } from '../types'
import { SessionManager } from '../engine/session-mgr'
import { ChatEngine } from '../engine/chat'
import { FileTransferEngine } from '../engine/file'
import { RPCEngine, formatFileListInfo, JOB_FILE_LIST } from '../engine/rpc'
import { isValidCallsign } from '../engine/callsign'
import { parseGps } from '../engine/gps'
import { TransportManager } from '../engine/transport-manager'
import { SESSION_CONTROL, SESSION_CHAT, SESSION_RPC, SESSION_POSITION } from '../engine/ddt2'
import { SESSION_TYPE_FILEXFER } from '../engine/control'
import { useChatStore } from '../store/chat-store'
import { usePingStore } from '../store/ping-store'
import { useStationStore } from '../store/station-store'
import { useFileStore } from '../store/file-store'
import { useLocalFilesStore } from '../store/local-files-store'
import { readFolderFile } from '../engine/local-files'
import { useConfigStore } from '../store/config-store'
import { useEventStore } from '../store/event-store'
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

      // The peer's negotiated session ID may collide with our fixed IDs (e.g.
      // SESSION_POSITION=7, or even SESSION_CHAT=1 / SESSION_RPC=2 in rare
      // cases). Look up the session manager for any negotiated session whose
      // remoteId matches, and if found, rewrite the frame's sessionId to our
      // local ID so the target engine can find the transfer in its bookkeeping.
      const negotiatedSession = sessionMgrRef.current?.getSessionByRemoteId(sessionId, frame.header.sourceStation)
      const effectiveSessionId = negotiatedSession?.localId ?? sessionId
      const routeFrame = effectiveSessionId !== sessionId
        ? { ...frame, header: { ...frame.header, sessionId: effectiveSessionId } }
        : frame

      const direction = frame.header.sourceStation !== config.myCallsign ? 'incoming' : 'outgoing'

      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Frame] ${direction === 'incoming' ? '←' : '→'} session=${sessionId}${effectiveSessionId !== sessionId ? '→' + effectiveSessionId : ''} type=${frame.header.type} seq=${frame.header.seq} ${frame.header.sourceStation} → ${frame.header.destStation}`,
        type: 'frame',
      })

      // Log routing decision for incoming non-control frames
      if (direction === 'incoming') {
        const routeTo = effectiveSessionId === SESSION_CHAT ? 'chat'
          : effectiveSessionId === SESSION_RPC ? 'rpc'
          : effectiveSessionId === SESSION_POSITION ? 'position'
          : 'xfer'
        console.log('[route] session=' + sessionId + (effectiveSessionId !== sessionId ? '→' + effectiveSessionId : '') + ' type=' + frame.header.type + ' seq=' + frame.header.seq + ' src=' + frame.header.sourceStation + ' → ' + routeTo)
      }

      if (effectiveSessionId === SESSION_CHAT) {
        await chatRef.current?.handleIncoming(routeFrame)
      } else if (effectiveSessionId === SESSION_RPC) {
        await rpcRef.current?.handleIncoming(routeFrame)
      } else if (effectiveSessionId === SESSION_POSITION) {
        const text = new TextDecoder().decode(frame.data)
        if (text === 'position?') {
          usePingStore.getState().addPing({
            from: frame.header.sourceStation,
            to: frame.header.destStation,
            type: 'position_request',
            data: text,
            timestamp: Date.now(),
          })
        } else {
          const fix = parseGps(text)
          if (fix) setStationPosition(frame.header.sourceStation, fix)
          usePingStore.getState().addPing({
            from: frame.header.sourceStation,
            to: frame.header.destStation,
            type: 'position_response',
            data: fix ? `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}` : text,
            timestamp: Date.now(),
          })
        }
      } else {
        await fileRef.current?.handleIncoming(routeFrame)
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
    sessionMgr.setOnOutgoing((frame, portName) => {
      if (frame.header.sessionId === SESSION_CONTROL) return
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Frame] → session=${frame.header.sessionId} type=${frame.header.type} seq=${frame.header.seq} ${frame.header.sourceStation} → ${frame.header.destStation} via ${portName ?? 'first connected port'}`,
        type: 'frame',
      })
    })
    sessionMgr.setIsPortConnected((portName) => transportMgr.isPortConnected(portName))
    sessionMgr.setOnMissingRemoteId((localId, hasRecord) => {
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[Session] Sending on local session ${localId} with no confirmed peer id yet (record ${hasRecord ? 'exists' : 'missing'}) — frame carries our own unrewritten id`,
        type: 'frame',
      })
    })
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
      addTransfer({ id, sessionId, filename, size, transferred: 0, direction: 'receive', state: 'offer', station: fromStation, timestamp: Date.now() })
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[File] Offer from ${fromStation}: ${filename} (${size} bytes)`,
        type: 'frame',
      })
    })
    fileTransfer.setOnProgress((_filename, transferred, total, sessionId) => {
      const store = useFileStore.getState()
      const existing = store.transfers.find((t) => t.sessionId === sessionId)
      console.log('[onProgress]', { filename: _filename, transferred, total, sessionId, found: !!existing, existingId: existing?.id })
      if (existing) {
        const state = transferred >= total ? 'complete' : transferred > 0 ? 'transferring' : existing.state
        updateTransfer(existing.id, { transferred, state, timestamp: Date.now() })
      }
    })
    fileTransfer.setOnDrop((sessionId, fromStation, frameType) => {
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[File] Dropped a type=${frameType} frame for session ${sessionId} from ${fromStation} — no active transfer registered under that id`,
        type: 'frame',
      })
    })
    fileRef.current = fileTransfer

    const rpc = new RPCEngine(sessionMgr)
    rpc.setFileTransferEngine(fileTransfer)
    rpc.setPullGate(() => useConfigStore.getState().config.allowRemoteFileTransfers)
    rpc.setDeletePassword(() => useConfigStore.getState().config.remoteDeletePassword)
    rpc.setFileProvider({
      list: async () => {
        const { files, handle, permission } = useLocalFilesStore.getState()
        // After a reload the stored folder handle comes back needing a fresh
        // user gesture to re-grant, so `files` is empty until the user clicks
        // reconnect — and we'd answer a peer's list request with an empty
        // dict, which real D-RATS shows as a failed connect rather than an
        // empty folder. Say so in the log instead of leaving it a mystery.
        if (files.length === 0) {
          useEventStore.getState().addEvent({
            time: Date.now(),
            text: !handle
              ? '[RPC] File list requested but no shared folder is selected — replying with an empty list'
              : permission !== 'granted'
                ? `[RPC] File list requested but the shared folder needs permission re-granted (click Reconnect in the Files tab) — replying with an empty list`
                : '[RPC] File list requested and the shared folder is empty — replying with an empty list',
            type: 'frame',
          })
        }
        return files.map((f) => ({
          name: f.name,
          info: formatFileListInfo(f.size, f.lastModified),
        }))
      },
      get: async (name) => {
        const { handle } = useLocalFilesStore.getState()
        if (!handle) return null
        return readFolderFile(handle, name)
      },
      remove: (name) => useLocalFilesStore.getState().removeFile(name),
    })
    rpc.setOnPullSend((filename, size, station) => {
      const id = crypto.randomUUID()
      addTransfer({ id, sessionId: -1, filename, size, transferred: 0, direction: 'send', state: 'negotiating', station, timestamp: Date.now() })
      return (sessionId, compressedSize) => updateTransfer(id, { sessionId, state: 'awaiting-response', ...(compressedSize !== undefined ? { size: compressedSize } : {}) })
    })
    rpc.setOnPullSendError((filename, station, err) => {
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[File] Send of "${filename}" to ${station} (triggered by their pull) failed: ${err instanceof Error ? err.message : String(err)}`,
        type: 'frame',
      })
    })
    rpc.setOnJobServed((jobType, requester, reply) => {
      const summary =
        jobType === JOB_FILE_LIST
          ? `${Object.keys(reply).length} file(s): ${Object.keys(reply).join(', ') || '(none)'}`
          : (reply.rc ?? JSON.stringify(reply))
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[RPC] Served "${jobType}" for ${requester} → ${summary}`,
        type: 'frame',
      })
    })
    rpc.setOnJobError((jobType, requester, err) => {
      useEventStore.getState().addEvent({
        time: Date.now(),
        text: `[RPC] Failed to answer "${jobType}" from ${requester}: ${err instanceof Error ? err.message : String(err)}`,
        type: 'frame',
      })
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

  useEffect(() => {
    // initEngine() only sets the SessionManager's station once, at whatever
    // config.myCallsign happened to be at that moment (which can be the
    // empty default if the persisted config hadn't hydrated yet, or if the
    // engine started before the callsign was ever set). Keep it in sync for
    // the rest of the session — every outgoing frame's source station comes
    // from here, so a stale value corrupts chat/RPC/file-transfer traffic
    // and any remote peer's replies get addressed to the wrong callsign.
    sessionMgrRef.current?.setStation(config.myCallsign || 'N0CALL')
  }, [config.myCallsign])

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