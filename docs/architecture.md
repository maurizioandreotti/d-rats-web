# Architecture — D-RATS Web

> Stack: React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Web Serial / WebSocket / File System Access APIs. No backend — pure client-side PWA for deployed/emergency use.

## 1. At-a-Glance

| Concern | Choice | Why |
|---------|--------|-----|
| UI | React 19 + Vite (`vite.config.ts:1`), `react-leaflet`/`leaflet` for maps, `react-markdown` for wiki | Fast HMR, small bundle, no SSR needed |
| State | Zustand 5 (`src/store/`) with `persist` middleware | Lightweight, no boilerplate; `localStorage` for config/chat/stations, `IndexedDB` for folder handle |
| PWA | `vite-plugin-pwa` (`vite.config.ts:8`) — `registerType: autoUpdate`, `workbox` cache of `**/*.{js,css,html,svg,png,ico,json}` + OSM tiles `CacheFirst` 30 d | Offline-first; installed app runs from service-worker cache |
| Serial | Web Serial API (`src/engine/serial.ts:51` `getSerialApi()`) | Only Chromium (Chrome/Edge) — same constraint as File System Access |
| Remote | WebSocket → TCP bridge (`ratflector-bridge.py:1`, `src/engine/ratflector.ts:32`) | Browser cannot open raw TCP to ratflector |
| Files | File System Access API + IndexedDB (`src/engine/local-files.ts:53`) | Real folder on disk (`download_dir` equivalent), survives reloads |
| Tests | Vitest 4 + Testing Library + jsdom (`vitest.config.ts:1`, `package.json:10`) | Unit tests for frame/codec/session/file/rpc/gps without radios |

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser PWA (React)                      │
│  src/components/*  ──▶  src/hooks/useDratsEngine.ts:23          │
│        │                     │                                   │
│        ▼                     ▼                                   │
│  Zustand stores ◀──── Engine layer (src/engine/*) ──▶  Web APIs │
│  src/store/*            serial, ddt2, transport,                │
│                         session-mgr, chat, file,                │
│                         rpc, ratflector, gps, local-files       │
│                                │                                │
│                    ┌───────────┴───────────┐                    │
│                    ▼                       ▼                    │
│              Web Serial API          WebSocket (bridge)         │
│              ICOM D-STAR radio       ratflector TCP             │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Repository Layout

```
.
├── src/
│   ├── engine/                 # Protocol & I/O — no React imports (except 2 store reads in authenticated-transport.ts)
│   │   ├── serial.ts           # Web Serial wrapper, XON/XOFF, DTR/RTS, queued 8-byte writes  :51, :115, :203, :251
│   │   ├── ddt2.ts             # DDT2 frame codec: header 25 B, yEnc, zlib, CRC  :5, :22, :56, :72, :112
│   │   ├── crc.ts              # CRC-CCITT 0x1021  :1, :18
│   │   ├── yencode.ts          # yEnc escape (OFFSET 64, ESC '=')  :1, :8
│   │   ├── callsign.ts         # Amateur callsign shape validator  :6
│   │   ├── control.ts          # Session 0 wire helpers (NEW/ACK/END)  :5, :16
│   │   ├── transport.ts        # SOB/EOB framing, decode, GPS/raw fallback  :5, :44, :67
│   │   ├── transport-manager.ts# Multi-port facade + warmup frame  :13, :146
│   │   ├── session-mgr.ts      # Negotiation, id rewrite, teardown, heard tracking  :47, :261, :314, :349
│   │   ├── chat.ts             # Chat/ping/status on session 1  :11, :18, :53
│   │   ├── file.ts             # Windowed file xfer on negotiated session  :6, :54, :391
│   │   ├── rpc.ts              # Fixed session 2 RPC: list/pull/delete  :9, :110, :254
│   │   ├── ratflector.ts       # WS bridge client, auth 101/102/200  :8, :32, :149
│   │   ├── gps.ts              # NMEA / GPS-A / APRS, distance/bearing/Maidenhead  :42, :117, :244
│   │   ├── local-files.ts      # FS Access + IndexedDB handle  :10, :53
│   │   ├── authenticated-transport.ts # Legacy placeholder  :18
│   │   └── index.ts            # Public barrel  :1
│   ├── store/                  # Zustand — see §4
│   ├── hooks/
│   │   └── useDratsEngine.ts   # Central wiring hook  :23, :37, :118, :277
│   ├── components/             # UI — see §5
│   ├── types/index.ts          # All shared interfaces  :1
│   ├── utils/format.ts         # formatFileSize  :1
│   ├── App.tsx                 # Global sniff → sniffer-store  :7
│   └── main.tsx                # ReactDOM mount
├── ratflector-bridge.py        # asyncio WS↔TCP proxy  :1, :83
├── vite.config.ts              # Vite + VitePWA manifest/workbox  :1
├── vitest.config.ts            # jsdom env
└── docs/
    ├── architecture.md         # this file
    ├── protocols.md            # wire formats
    ├── api-reference.md        # symbol-level API
    └── wiki/                   # user-facing wiki (radio-setup, technical, troubleshooting)
```

## 3. Layering

**Engine** (`src/engine/`) is framework-agnostic: it exposes classes & pure functions and never imports React or components. The single exception is `authenticated-transport.ts:1` which reads `useConfigStore`/`useAuthStore` — treated as legacy and not on the hot path.

**Wiring** (`src/hooks/useDratsEngine.ts:23`) is the only place that instantiates and interconnects `TransportManager` + `SessionManager` + `ChatEngine` + `FileTransferEngine` + `RPCEngine`. Components never construct engines directly; they call `connectPort`/`disconnectPort` or engine methods via the refs the hook returns.

**State** (`src/store/`) is the system of record for the UI. Engines call store callbacks (or `getState()` reads) at I/O boundaries; components subscribe via selectors (`useChatStore(s=>s.messages)`), so re-renders are scoped.

**UI** (`src/components/`) is tab-based (`Layout.tsx:1`): Chat, Stations, Map, Files, Config, Sniffer, Pings, Ratflector, Wiki. No component holds protocol state; all protocol state lives in engines or stores.

## 4. Engine Layer

### 4.1 Serial — `serial.ts:56`

* `getSerialApi() :51` feature-detects `navigator.serial`; `requestPort()`/`getKnownPorts()` wrap it.
* `connect(port, config) :115` closes any stale streams, `port.open({baudRate, dataBits, stopBits, parity, flowControl:'none'})`, asserts DTR+RTS three times with 200 ms backoff (ICOM power), verifies DTR, then `startReadLoop()`.
* **Write path**: `send()` → `sendQueue` chain (`:201`) → `sendNow()` chunks 8 B, `writer.write()`, per-frame XOFF budget 15 s (`:221`), fans each chunk to `onSniffCallbacks('tx')`. Failures reject the caller via the queue without wedging it.
* **Read path**: `startReadLoop() :251` polls up to 10 s for `readable`, then `reader.read()` loop: filters `0x11` XON / `0x13` XOFF into `xonState`, forwards raw bytes to `onSniffCallbacks('rx')`, filtered bytes to `onDataCallbacks`. Restarts after 500 ms if `!closed`.

### 4.2 DDT2 Codec — `ddt2.ts:5`

* **Delimiters**: `ENCODED_HEADER '[SOB]'` / `ENCODED_TRAILER '[EOB]'` (`:5`).
* **Header** 25 B big-endian (`:86`): `[magic:1][seq:2][sessionId:1][type:1][checksum:2][length:2][s_station:8][d_station:8]` where stations are `padCallsign('~')` / `trimCallsign(0x7E)` (`:22`).
* **Compress**: `deflate()`/`inflate()` (`:56`) via `CompressionStream('deflate')` / `DecompressionStream`.
* **Encode** (`encodeFrame :72`): choose magic `0xDD` compressed / `0x22` uncompressed, compress data, build header with checksum zeroed, `computeCrc(header+data)` (`crc.ts:18`) → write checksum, `concat(header,data)` → `yencode()` → wrap with SOB/EOB.
* **Decode** (`decodeFrame :112`): locate SOB/EOB, `ydecode()`, check header length & magic, slice payload by `length`, recompute CRC over header (zeroed checksum) + payload, compare, inflate if needed. Returns `null` on any mismatch.

### 4.3 CRC & YEnc — `crc.ts:1`, `yencode.ts:1`

* **CRC**: bit-wise CCITT 0x1021 (`:1`), `computeCrc` inits 0, appends two zero bytes (`:18`), `verifyCrc` (`:24`).
* **YEnc**: `OFFSET 64`, `ESC 0x3D '='` (`:1`), `DEFAULT_BANNED = [0x11,0x13,0x1a,0x00,0x84,0xe7,0xfd,0xfe,0xff,0xc0,0xdb]` (`:4`). Every banned byte or `=` becomes `[ESC, (byte+OFFSET)&0xff]` (`:8`); decode subtracts offset (`:20`).

### 4.4 Transport — `transport.ts:5`

* Wraps a `RadioSerial`, listens via `addDataCallback`. Buffers in `this.buffer`.
* `onSerialData :44` → `concat` + `parseFrames()` + (if no SOB pending) `matchGps()` + `matchRawText()`.
* `parseFrames :67` loops SOB..EOB, slices inclusive, `decodeFrame().then(onFrame | onDecodeError)`. Remainder stays buffered for the next read.
* `matchGps :96` tries NMEA pair + station, then `$$CRCxxxx, ...\r` regex; strips consumed text from buffer.
* `matchRawText :122` requires `^([^\r\n]{5,})\r\n?` so a partial serial chunk isn't treated as a complete line.
* `sendFrame :39` is `encodeFrame` → `serial.send()`.

### 4.5 TransportManager — `transport-manager.ts:13`

* Owns `serialTransports: Map<name,{serial,transport}>` and `ratflectorTransports: Map<name,RatflectorConnection>`.
* `connectSerial :114` — `requestPort()`, new `RadioSerial+Transport`, wire `onFrame→onFrame(name)`, `onGpsString→handleRawGps`, `onRawText→handleRawText`, `onDecodeError→eventLog`, connect at `config.serial.baudRate`, **warmup frame** `type 254, session 0, magic 0x22, s='!', d='!', data 16×0x01, uncompressed` (`:146`).
* `connectRatflector :171` — delegates to `RatflectorConnection.connect(host,port,callsign,password,bridgeUrl)` and stores it.
* `handleRawGps :22` — `parseIcomGps ?? parseRawNmeaGps` → `updateStation(lastHeard)` + `setStationPosition` + if `message` then synth chat frame (`forwardChatText`).
* `handleRawText :67` — callsign regex, `updateStation`, synth chat frame `session 1`.
* `sendFrame :233` — routes to named port or first connected; throws if none.

### 4.6 SessionManager — `session-mgr.ts:47`

The most subtle layer.

* **Id space**: `0=control, 1=chat (SESSION_CHAT), 2=rpc (SESSION_RPC)` fixed (`ddt2.ts:12`); dynamic from `3` (`:55`), increments `nextSessionId`, recycles 3..254 on overflow (`:398`).
* **State**: `sessions: Map<localId, SessionRecord{localId, remoteId|null, destStation, sessionType, name, state:'sync'|'open'|'closed'}` (`:26`), plus `heardStations`, `stationPorts`, `pendingAcks`, `pendingEnds`, `isPortConnected` guard.
* **Retry tuning** (`:41`): `NEW_SESSION_RETRIES=10`, `FIRST=5000`, `REST=15000`, `END_RETRIES=3`, `END_MS=10000` — matches Python `control.py` for half-duplex RF. Tunable via `setRetryTiming()` (`:64`) for tests.
* **Callbacks**: `setOutgoingCallback` (actual send), `setOnOutgoing` (mirror for logging), `setIsPortConnected`, `setOnMissingRemoteId`, `setOnRpcFrame`, `setOnIncomingSession`.
* **Ingress** `incoming :141` → `heardStations.set(src, now)`, route `0 → handleControlFrame`, else scan `sessions` for `SESSION_TYPE_RPC && remoteId===sessionId && dest===src && open → onRpcFrame`.
* **Egress** `outgoing :261` → stamp `sourceStation = this.station`, default `dest CQCQCQ`, resolve **port by remembered peer** (`stationPorts[dest]` if `isPortConnected`), then **id rewrite**: for negotiated sessions (session not 0/1/2) replace `sessionId = remoteId` if known, else fire `onMissingRemoteId`, finally `onOutgoing` then `outgoingCallback`.
* **Control FSM** `handleControlFrame :165`:
  * Type `2 ACK`: `decodeSessionAck → record.remoteId=peerId, state open`, resolve `pendingAcks`.
  * Type `1 END`: `decodeSessionEnd → delete record, echo END with replyId`, resolve `pendingEnds`.
  * Type `≥3 NEW` (= `3+sessionType`): `decodeNewSessionRequest → dedup on remoteId+dest`, allocate `localId`, store `open`, send `ACK(requesterId, localId)`, fire `onIncomingSession`.
* **Negotiation** `startSession :314` allocates `sync` record, loops retries: `pendingAcks.set(localId, resolve)`, `sendControlFrame(dest, newSessionControlType(sessionType), encodeNewSessionRequest(localId,name))`, wait `FIRST` then `REST`. Throws after 10 misses.
* **Teardown** `endSession :349` sends `END(targetId)` and waits `END_MS` per attempt, echo handling above, then deletes locally.

### 4.7 Chat — `chat.ts:18`

* Fixed `sessionId = SESSION_CHAT (=1)`. Own `pingInfo` string (`:21`).
* Callbacks: `onMessage`, `onPing`, `onGpsFix`, `onStatus`.
* `handleIncoming :53` switches `header.type`:
  * `0 DEF`: if not `$GP`/`$$CRC`, `onMessage`; also `parseGps → onGpsFix`.
  * `1 PING_REQ`: `onPing(request)`, if `dest===myCall||CQCQCQ` then random 0-5 s jitter on `CQCQCQ`, reply `PING_RSP` with `pingInfo||'Running D-RATS Web'`, `onPing(response)`, then `sendStatus('D-RATS Web')`.
  * `2 PING_RSP`: `onPing(response)`.
  * `3 PING_ERQ`: `onPing(echo_request)`, if for us then 0-10 s jitter on CQCQCQ, echo same data as `PING_ERS`.
  * `4 PING_ERS`: `onPing(echo_response)` + resolve `pingEchoHandlers[station]`.
  * `5 STATUS`: first char is status byte, rest is text → `onStatus`.

### 4.8 File Transfer — `file.ts:54`

* Constants (`:6`): `BLOCK=1024`, `WINDOW=8 (effective floor(4096/BLOCK)=4)`, `MAX_RETRIES=10`, `MIN_TIMEOUT 4000*(attempt+1)`, `OFFER_TIMEOUT 20000`; wire types `DAT 4 / ACK 1 / REQACK 5` (`:16`).
* **State** `TransferState :32`: `sessionId, dest, filename, totalSize, originalSize, direction, phase:'awaiting-offer'|'awaiting-accept'|'awaiting-response'|'transferring'|'complete'|'failed', oseq, chunks[], decodedData, recvList, outOfOrder, expectedSeq, receivedBytes`. Inbox pattern `pendingAcked/ackWaiters` and `pendingReplies/dataWaiters` avoids races (`:66`).
* **Ingress** `handleIncoming :112`:
  * Unknown session → `onDrop`.
  * `DAT` in `awaiting-offer`: parse `[u32LE size][filename]`, `totalSize/filename/expectedSeq`, phase `awaiting-accept`, `onOffer`, **auto `acceptOffer`** (sends `"OK"` immediately) — no manual gate.
  * `DAT` in `awaiting-response`: queue `pendingReplies`, wake waiter.
  * `DAT` in `transferring`: `deliverInOrder` (out-of-order map, in-order append, when `receivedBytes>=totalSize` concat `chunks` → single `inflate` → `decodedData`, phase `complete`, `onProgress(100%)`, `endSession`).
  * `ACK`: merge seqs into `pendingAcked`, wake waiter.
  * `REQACK`: ACK back intersection `recvList ∩ requested`.
* **Reliable send** `sendReliable :342`: slice `chunks→blocks{seq,data}`, per window clear `pendingAcked`, `sendDataBlock` each, then per attempt: compute pending, `sendReqAck(pending seqs)`, `waitForAckSeqs(timeout = MIN*(attempt+1))` until window fully acked or `MAX_RETRIES` → throw. Calls `onWindowSent(sentBytes)` for incremental progress.
* **Offer** `sendFile :391`: `startSession(FILEXFER, dest, filename) → onSessionId(-1→real)`, `deflate(data)` (file-level zlib, independent of DDT2), create `awaiting-response` state, send offer block `[u32 size][filename]` via `sendReliable`, `waitForData(OFFER_TIMEOUT)` → handle `"OK"` / `"RESUME:n"` / error, chunk `compressed.slice(offset)` into `BLOCK` sizes, `sendReliable(chunks, onProgress)`, `phase complete → onProgress 100% → endSession`.
* **Controls**: `acceptOffer :479` (`transferring`, `sendReliable(["OK"])`), `cancelTransfer :497` (phase `failed`, wake waiters, `endSession`), getters `getTransfer`/`getCompletedData`.

### 4.9 RPC — `rpc.ts:110`

* Fixed `SESSION_RPC = 2` (`ddt2.ts:16`), no negotiation. `RPC_TYPE_REQUEST 0 / ACK 1` (`:9`).
* **Dict codec** (`:56`): `encodeDict {k:US:v} RS-joined`, `decodeDict` split RS then US.
* **List info** `formatFileListInfo :41`: `B` or `KB` (trunc `/1024`, no MB), timestamp `YYYY-MM-DD HH:MM:SS` → exactly 4 tokens required by Python peer's `value.split(" ")`.
* **Jobs**: `FILE_LIST`, `PULL_FILE`, `DELETE_FILE` (`:17`), `TIMEOUT 30 s` (`:21`), `seq ident 0..65535` (`:283`).
* `handleIncoming :166`: type ACK resolves `pendingCalls[seq]`; type REQUEST parses `jobType\x1d + dict`, `handleJob`, then `sendRaw(ACK, seq, encodeDict(reply))` with `onJobServed/onJobError` hooks.
* `handleJob :207`: list → `fileProvider.list()`, pull → gate `allowRemoteFileTransfers` (else `rc` error), get `fileProvider.get(fn)` then fire-and-forget `fileTransfer.sendFile(...).catch(onPullSendError)` and return `{rc:'OK'}`, delete → check `remoteDeletePassword` else remove.
* Outbound `listFiles/pullFile/deleteFile :254` wrap `submit(jobType, args, dest)` which races `sendRaw(REQUEST, ident, payload)` against timeout.

### 4.10 GPS — `gps.ts:42`

* `warnIfNmeaChecksumBad :5` XOR over body, warn only.
* `gpsaChecksum :21` reversed CRC-16/CCITT poly `0x8408` init `0xffff` bit-reflected.
* `parseNmea :42` handles `$GPGGA/$GPRMC/$GPGLL` → `{lat,lon,alt,speed,direction}` via `nmeaValueToDeg` (`deg + min/60`).
* `GPS_A_BODY` regex (`:117`) and `APRS_DATA_TYPE_IDS` set (`:123`) + `parseGpsaBody :130`, `splitGpsaFrame :155` (handles `$$CRCxxxx, rest` plus optional `,PATH`), then `parseAprs :174`, `parseAprsPosition`, `parseIcomGps :184` (valid callsign + position else message if not APRS type), `parseRawNmeaGps :204`, `parseGps :240` as `nmea ?? aprs ?? aprsPosition`.
* Utilities: `distance` haversine `R 6371000` (`:244`), `bearingTo` (`:294`), `toMaidenhead` 6-char QTH (`:264`).

### 4.11 Rate/RAT — `ratflector.ts:8`

* `AUTH_TIMEOUT 10 s` (`:6`), WebSocket `binaryType arraybuffer`.
* `connect(host,port,callsign,password,bridgeUrl) :32` → `ws://localhost:9001/?host=…&port=…` (`bridgeUrl || ws://localhost:9001`), status `connecting`, `onopen→doAuth`, `onmessage` routes auth text `^\d{3}\s+` to `authQueue`/`authResolve` else `concat` + `parseFrames` (SOB/EOB loop, `decodeFrame`), `onclose/onerror` → disconnected/error.
* `doAuth :149` → welcome `100→connected`, `101→USER calsign`, `200→connected`, `102→PASS password→200`, else throw.
* `sendFrame :129` → `encodeFrame` → `ws.send(ArrayBuffer)`, `isConnected` checks `OPEN && authenticated`.

### 4.12 Persistence — `local-files.ts:10`, `store/local-files-store.ts:13`

* `pickFolder :53` → `showDirectoryPicker({mode:'readwrite'})` → `idbSet('sharedFolder', handle)`. `getStoredFolder :62` → `idbGet`, `hasPermission/queryPermission`, `requestPermission` (needs user gesture). `listFolder :84` iterates `handle.entries()`, filters `file`, sorts by name. `readFolderFile :94`, `writeFolderFile :104`, `removeFolderFile :115`.
* Store mirrors handle in memory (`handle, folderName, permission, files[]`) and `init/pick/reconnect/refresh/addFile/removeFile`; `handle` itself stays in IndexedDB because `localStorage` cannot store `FileSystemDirectoryHandle`.

## 5. State Layer — Zustand

| Store | File | Persist key | Shape (excerpt) | Notes |
|-------|------|-------------|-----------------|-------|
| `useConfigStore` | `store/config-store.ts:14` | `drats-config` v3 `migrate=>DEFAULT` | `config: AppConfig{myCallsign, myName, signOn, signOff, pingInfo, units, showUtc, ports[{type, serial, ratflector}], mapCenter, mapZoom, myPosition, autoConnect, allowRemoteFileTransfers, remoteDeletePassword}`, `updateConfig`, `updatePort`, `addPort`, `removePort`, `resetConfig` | Single source for identity & ports |
| `useStationStore` | `store/station-store.ts:6` | `drats-stations` | `stations: Record<callsign, Station{status,lastHeard,position,port}>`, `ownPosition`, CRUD | Updated on every valid frame (`useDratsEngine :51`) |
| `useChatStore` | `store/chat-store.ts:5` | `drats-chat` | `messages: ChatMessage[]`, `addMessage`, `clearMessages` | Unbounded (no slice); directions incoming/outgoing |
| `usePortStore` | `store/port-store.ts:5` | — (memory) | `statuses: Record<name,PortStatus>`, `messages`, `setStatus` | Ephemeral — not persisted |
| `useFileStore` | `store/file-store.ts:4` | — | `transfers: FileTransferItem[]`, `addTransfer`, `updateTransfer` | Transient, reset on reload |
| `useRpcStore` | `store/rpc-store.ts:10` | — | `listings: Record<station,StationListing{status,files,error}>`, `selectedStation/Port` | Persists selection across tab switches |
| `useLocalFilesStore` | `store/local-files-store.ts:13` | — (IndexedDB owns handle) | `handle, folderName, permission, files:LocalFileEntry[]` | `init` rehydrates from IndexedDB |
| `usePingStore` | `store/ping-store.ts:4` | — | `pings: PingInfo[]` slice last 50 | Chat pings + position req/resp |
| `useSnifferStore` | `store/sniffer-store.ts:12` | — | `packets: SniffedPacket[]` MAX 5000, `paused`, `capturing` | `App.tsx:8` hooks `RadioSerial.onSniffCallbacks` |
| `useEventStore` | `store/event-store.ts:3` | — | `events: EventLogEntry[]` MAX 1000, `type 7 variants` | Central diagnostics log |
| `useRatflectorStore` | `store/ratflector-store.ts:6` | — | `status, statusMessage, host, port, pings` | Mirrors ratflector port status |
| `useAuthStore` | `store/auth-store.ts:11` | `d-rats-auth` (partialized) | `currentUser, isAuthenticated, isAuthRequired, trustLocal, users[]` | Default `admin/admin`, `guest/guest` |

`getState()` reads at I/O edges avoid React renders from engine hot paths.

## 6. Wiring Hook — `useDratsEngine.ts:23`

*Refs* `transportMgrRef`, `sessionMgrRef`, `chatRef`, `fileRef`, `rpcRef`, `initializedRef` — engines live outside React state to avoid re-instantiation.

*`handleFrame :37`* (per-port callback to `TransportManager`): validate `isValidCallsign(src)`, `sessionMgr.heardOnPort(src,port)+incoming`, `updateStation(lastHeard)`, drop `SESSION_CONTROL`, compute `effectiveSessionId = getSessionByRemoteId(sessionId,src)?.localId ?? sessionId` (collision with fixed `7`), log `[Frame] ←/→ session=..` to `eventStore`, console `route→ chat/rpc/position/xfer`, then dispatch to `chat/rpc/position/file`. Position path: `"position?"` → `position_request` ping, else `parseGps` → `setStationPosition` + `position_response` ping.

*`initEngine :118`* (once): creates `TransportManager`, `SessionManager('N0CALL')` wired `onOutgoing→eventLog`, `isPortConnected→transportMgr.isPortConnected`, `onMissingRemoteId→eventLog`, then `ChatEngine(pingInfo, onMessage→chatStore+event, onPing→pingStore+event, onGpsFix→setStationPosition, onStatus→updateStation)`, `FileTransferEngine(onOffer→fileStore+event, onProgress→fileStore, onDrop→event)`, `RPCEngine(fileTransfer, pullGate, deletePassword, FileProvider backed by local-files-store+formatFileListInfo, onPullSend→fileStore, onPullSendError→event, onJobServed/onJobError→event)`, finally `transportMgr.setOnFrame(handleFrame)` + `sessionMgr.setOutgoingCallback→transportMgr.sendFrame`.

*`connectPort :277`* → `initEngine()`, `connectSerial` or `connectRatflector`, then `chat.sendStatus(signOnMessage||'Online (D-RATS Web)')`. *`disconnectPort :296`* → `transportMgr.disconnect(name)`.

*Effects*: `useEffect :301` keeps `sessionMgr.station` in sync with `config.myCallsign` (empty hydrate → empty source bug); `useEffect :314` auto-connects `config.ports.filter(enabled)` once when `autoConnect` true.

## 7. UI Layer — `src/components/`

* **Layout** (`Layout.tsx:1`) — tab shell + station sidebar; holds `useDratsEngine()` instance so it owns the lifecycle for the whole app.
* **ChatPanel** (`ChatPanel.tsx:1`) — multi-port badges, blue incoming / green outgoing borders; uses `chatStore`, `configStore`, `chatRef.sendText/sendPing`.
* **StationsList** (`StationsList.tsx:1`) — `station-store` table + `Ping All`, `Request Position/All` → `chatRef` or `session 7` text `"position?"`.
* **MapPanel** (`MapPanel.tsx:1`) — `react-leaflet` markers from `stationStore`, center/zoom from `configStore`.
* **FileTransfer** (`FileTransfer.tsx:1`) — transfers table (`fileStore`) + two panes.
* **SharedFiles** (`SharedFiles.tsx:1`) — `local-files-store` local folder picker (`Pick/Reconnect/Refresh/Delete/Upload`); `Upload` calls `fileRef.sendFile` to the station selected in `RemoteBrowser`.
* **RemoteBrowser** (`RemoteBrowser.tsx:1`) — `rpcStore` + `stationStore` heard-only station picker, port selector, `Connect/Disconnect/Download/Delete` → `rpcRef.listFiles/pullFile/deleteFile` + `localFilesStore.addFile`.
* **ConfigPanel** (`ConfigPanel.tsx:1`) — ports editor (serial/ratflector), callsign/name, `allowRemoteFileTransfers`, `remoteDeletePassword`, map defaults.
* **SerialConnect / RatflectorPanel** — connect UI.
* **SnifferPanel** (`SnifferPanel.tsx:1`) + **EventLog** (`EventLog.tsx:1`) — `snifferStore` hex/ASCII & `eventStore` diagnostics.
* **PingPanel** — renders `pingStore` history.
* **WikiPanel/InfoPanel/AuthPanel** — markdown wiki and auth UI.

All components are function components reading stores via selectors; no prop-drilling of engines.

## 8. Data Flows

### 8.1 Inbound (radio → UI)

```
Radio bytes → RadioSerial.readLoop (filter XON/XOFF) → Transport.onSerialData
  → parseFrames (SOB/EOB → decodeFrame) → TransportManager.onFrame → useDratsEngine.handleFrame
    → SessionManager.incoming (control ACK/END/NEW or heard tracking)
    → stationStore.updateStation
    → id-rewrite via getSessionByRemoteId
    → route to Chat/RPC/Position/File engine → store+event callbacks → React re-render
  ∥ if not a DDT2 frame → matchGps / matchRawText → synth session-1 chat frame → same route
```

### 8.2 Outbound (UI → radio)

```
UI action → chat/file/rpc engine.send* → SessionManager.outgoing
  → stamp sourceStation, default dest CQCQCQ, resolve port by heard-on-port
  → rewrite sessionId local→remote for negotiated sessions
  → TransportManager.sendFrame(portName) → Transport.sendFrame → RadioSerial.send (queue, 8-B chunks, XOFF)
  → sniffer('tx') + onOutgoing event log
```

### 8.3 File transfer end-to-end

`SharedFiles Upload` or `RPC pull ack` → `FileTransferEngine.sendFile` → `SessionManager.startSession(FILEXFER)` (10× 5 s/15 s) → `deflate` → `sendReliable(offer [u32LE compressedSize][filename])` → `wait RESUME/OK (20 s)` → chunk `1024` → `sendReliable(windows of 4, REQACK/ACK, 4000*(attempt+1), 10 retries)` per window → `endSession` (echo handshake). Receiver: `SessionManager` auto-accepts `T_NEW` → `FileTransfer` awaits `DAT offer` → `onOffer` → auto `ACK OK` → `deliverInOrder` with `outOfOrder` map → `inflate` once, `onProgress(100%)`, `endSession`.

### 8.4 RPC pull

`RemoteBrowser Download` → `RPCEngine.pullFile → submit(PULL, {fn}, dest)` → `TransportManager` → `SessionManager.outgoing (fixed 2)` → rate: server `RPCEngine.handleJob` checks `allowRemoteFileTransfers`, `get file`, fire-and-forget `FileTransfer.sendFile(...).catch(onPullSendError)`, replies `{rc:'OK'}` synchronously on `session 2`. Client's `waitForData` resolves, file arrives moments later as normal file transfer.

## 9. Build & PWA

* `vite.config.ts:8` — `VitePWA({registerType:'autoUpdate', manifest:{name:'D-RATS Web', short_name:'D-RATS', theme/background '#1a1a2e', icons:['/favicon.svg']}, workbox:{globPatterns:'**/*.{js,css,html,svg,png,ico,json}', runtimeCaching:'https://tile.openstreetmap.org/*' CacheFirst 500/30 d}})`.
* Install: `npm run build` → `dist/` (service worker only in prod), serve on `localhost` (or HTTPS for public hosting), Install icon → standalone window (`README.md:30`).
* `package.json:7` scripts: `dev`, `build (tsc -b && vite build)`, `preview`, `test`, `lint`, `format`, `typecheck`.

## 10. Testing

* `vitest.config.ts` + `src/engine/*.test.ts`:
  * `ddt2.test.ts` — encode/decode round-trips, CRC mismatch, compression toggle.
  * `transport.test.ts` — SOB/EOB accumulation across serial chunks.
  * `session-mgr.test.ts` — negotiation, id rewrite, teardown, retry timing override.
  * `file-transfer.test.ts` — two in-memory `SessionManager+FileTransferEngine` pairs wired together, full handshake/window/ACK/teardown, rejection path.
  * `rpc.test.ts` — in-memory file-list/pull/delete, pull triggers file send, password gate.
  * `gps.test.ts` — NMEA/GPS-A/APRS fixtures, checksum tolerance, Maidenhead.
* Real-radio ratflector tests are manual (WSL2 `ws://<VM-IP>:9001` workaround, see `AGENTS.md:99`).

## 11. Cross-References

* Wire details: [`protocols.md`](./protocols.md)
* Symbol API: [`api-reference.md`](./api-reference.md)
* User wiki: [`wiki/index.md`](./wiki/index.md) → `radio-setup.md`, `technical.md`, `troubleshooting.md`, `features.md`
* Agent notes / status: [`../AGENTS.md`](../AGENTS.md)

