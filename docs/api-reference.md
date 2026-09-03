# API Reference — D-RATS Web `v0.1.2`

> Generated from source analysis on 2026-05-11. All file paths are relative to the repository root. Line numbers are indicative — search the symbol name if they drift.

## Table of Contents
- [Project Entry Points](#project-entry-points)
- [Shared Types (`src/types/index.ts`)](#shared-types-srctypesindexts)
- [Engine Layer (`src/engine/`)](#engine-layer-srcengine)
  - [RadioSerial (`serial.ts`)](#radioserial-serialts)
  - [DDT2 Codec (`ddt2.ts`)](#ddt2-codec-ddt2ts)
  - [CRC (`crc.ts`)](#crc-crcts)
  - [YEnc (`yencode.ts`)](#yenc-yencodets)
  - [Callsign (`callsign.ts`)](#callsign-callsignts)
  - [Control Channel (`control.ts`)](#control-channel-controlts)
  - [Transport (`transport.ts`)](#transport-transportts)
  - [TransportManager (`transport-manager.ts`)](#transportmanager-transport-managerts)
  - [SessionManager (`session-mgr.ts`)](#sessionmanager-session-mgrts)
  - [ChatEngine (`chat.ts`)](#chatengine-chatts)
  - [FileTransferEngine (`file.ts`)](#filetransferengine-filets)
  - [RPCEngine (`rpc.ts`)](#rpcengine-rpcts)
  - [RatflectorConnection (`ratflector.ts`)](#ratflectorconnection-ratflectorts)
  - [GPS (`gps.ts`)](#gps-gpsts)
  - [Local Files (`local-files.ts`)](#local-files-local-filests)
  - [AuthenticatedTransport (`authenticated-transport.ts`)](#authenticatedtransport-authenticated-transportts)
  - [Barrel (`index.ts`)](#barrel-indexts)
- [State Layer — Zustand Stores (`src/store/`)](#state-layer--zustand-stores-srcstore)
- [Hooks (`src/hooks/`)](#hooks-srchooks)
- [Utilities (`src/utils/`)](#utilities-srcutils)
- [Components (`src/components/`) — Props Surface](#components-srccomponents--props-surface)
- [Error Handling & Diagnostics](#error-handling--diagnostics)

---

## Project Entry Points

| File | Role |
|------|------|
| `src/main.tsx:1` | ReactDOM bootstrap, mounts `<App />` |
| `src/App.tsx:7` | Registers global `RadioSerial` sniff listener → `useSnifferStore.addPacket` and renders `<Layout />` |
| `src/vite-env.d.ts:1` | Vite client type augmentation |
| `package.json:7` | Scripts: `dev`, `build`, `preview`, `test`, `lint`, `format`, `typecheck` |

---

## Shared Types (`src/types/index.ts`)

All domain types live in `src/types/index.ts:1`. Re-exported nowhere — import directly.

### `Station` `src/types/index.ts:1`
```ts
interface Station {
  callsign: string
  status: StationStatus
  lastHeard: number        // epoch ms
  position?: GPSPosition
  port?: string
}
```

### `StationStatus` `src/types/index.ts:9`
```ts
const StationStatus = { Unknown: 0, Online: 1, Unattended: 2, Offline: 9 } as const
type StationStatus = typeof StationStatus[keyof typeof StationStatus]
```

### `GPSPosition` `src/types/index.ts:17`
```ts
interface GPSPosition {
  lat: number; lon: number
  alt?: number; speed?: number; direction?: number
  timestamp?: number; source?: string
  symbolTableId?: string; symbolCode?: string
}
```

### `ChatMessage` `src/types/index.ts:29`
```ts
interface ChatMessage {
  id: string; from: string; to: string; text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  port?: string
  type?: 'chat' | 'status' | 'system'
}
```

### `DDT2Header` / `DDT2Frame` `src/types/index.ts:40`
```ts
interface DDT2Header {
  magic: number; seq: number; sessionId: number; type: number
  checksum: number; length: number
  sourceStation: string; destStation: string
}
interface DDT2Frame { header: DDT2Header; data: Uint8Array }
```

### `SessionType` `src/types/index.ts:56`
```ts
const SessionType = { Stateless: 0, General: 1, FileTransfer: 5, FormTransfer: 6, RPC: 7 } as const
```

### `FileTransferItem` `src/types/index.ts:65`
```ts
interface FileTransferItem {
  id: string; sessionId: number; filename: string
  size: number; transferred: number
  direction: 'send' | 'receive'
  state: 'negotiating' | 'offer' | 'awaiting-response' | 'transferring' | 'complete' | 'error'
  station: string; timestamp: number
}
```

### `RemoteFileEntry` `src/types/index.ts:77`
```ts
interface RemoteFileEntry { name: string; info: string } // info = formatted size + timestamp
```

### `SerialConfig` / `RatflectorConfig` / `PortConfig` `src/types/index.ts:82`
```ts
interface SerialConfig { baudRate: number; dataBits: number; stopBits: number; parity: 'none'|'even'|'odd'; flowControl: 'xon/xoff'|'none' }
interface RatflectorConfig { host: string; port: number; callsign: string; password: string; bridgeUrl?: string }
interface PortConfig {
  enabled: boolean; type: 'serial'|'ratflector'; settings: string
  sniff: boolean; raw: boolean; name: string
  serial?: SerialConfig; ratflector?: RatflectorConfig
}
```

### `PingInfo` `src/types/index.ts:111`
```ts
interface PingInfo {
  from: string; to: string
  type: 'request'|'response'|'echo_request'|'echo_response'|'position_request'|'position_response'
  data: string; timestamp: number
}
```

### `AppConfig` `src/types/index.ts:119`
```ts
interface AppConfig {
  myCallsign: string; myName: string; signOnMessage: string; signOffMessage: string
  pingInfo: string; units: 'imperial'|'metric'; showUtc: boolean
  ports: PortConfig[]; mapCenter: [number,number]; mapZoom: number
  myPosition?: GPSPosition; focusCenter?: [number,number]; autoConnect: boolean
  allowRemoteFileTransfers: boolean   // gates RPC pull-file (mirrors D-RATS prefs.allow_remote_files)
  remoteDeletePassword: string        // gates RPC delete-file (mirrors D-RATS remote_admin_passwd)
}
```

### File System Access augmentation `src/types/file-system-access.d.ts:7`
Augments `Window.showDirectoryPicker` and `FileSystemHandle.queryPermission/requestPermission`. No runtime export.

---

## Engine Layer (`src/engine/`)

### RadioSerial (`serial.ts`)

Wraps the **Web Serial API** with XON/XOFF filtering, queued writes, and DTR/RTS assertion for ICOM radios.

**Constants** `src/engine/serial.ts:1`
```ts
const XON = 0x11; const XOFF = 0x13
```

**Static sniff bus** `src/engine/serial.ts:57`
```ts
class RadioSerial {
  static onSniffCallbacks: Array<(direction: 'rx'|'tx', data: Uint8Array) => void>
  static addSniffListener(cb: (direction:'rx'|'tx', data: Uint8Array)=>void): void
  static removeSniffListener(cb: ...): void
  static clearSniffListeners(): void
  static async requestPort(): Promise<SerialPort>
  static async getKnownPorts(): Promise<SerialPort[]>
}
```

**Instance API** `src/engine/serial.ts:71`
```ts
class RadioSerial {
  addDataCallback(cb: (data: Uint8Array)=>void): void
  removeDataCallback(cb: (data: Uint8Array)=>void): void
  setOnData(cb: (data: Uint8Array)=>void): void       // replaces all callbacks
  setOnDisconnect(cb: ()=>void): void
  async connect(port: SerialPort, config: RadioSerialConfig): Promise<void>
  async disconnect(): Promise<void>
  send(data: Uint8Array): Promise<void>                 // queued, 8-byte chunked, XON/XOFF-aware
  get isConnected(): boolean
  get portInfo(): { usbVendorId?: number; usbProductId?: number } | null
}
```
- `connect` `src/engine/serial.ts:115` — opens port with `flowControl:'none'`, asserts DTR+RTS (3 retries), polls for `readable`, starts `startReadLoop()`.
- `send` `src/engine/serial.ts:203` — serializes through `sendQueue`; per-frame XOFF budget `xoffTimeoutMs = 15000`; rejects if `closed` or writer missing.
- `startReadLoop` `src/engine/serial.ts:251` — filters `0x11`/`0x13`, fans out to `onSniffCallbacks` (raw) and `onDataCallbacks` (filtered); auto-restarts after 500 ms if not `closed`.
- `getSerialApi()` `src/engine/serial.ts:51` — returns `navigator.serial` or `undefined` (feature-detect).

**Helper** `sleep(ms)` `src/engine/serial.ts:351` — `Promise`-based delay.

---

### DDT2 Codec (`ddt2.ts`)

Implements the **DDT2 frame** wire format: 25-byte header + yEnc + optional zlib, delimited by `[SOB]` / `[EOB]`.

**Wire delimiters & magic** `src/engine/ddt2.ts:5`
```ts
const ENCODED_HEADER  = Uint8Array([0x5b,0x53,0x4f,0x42,0x5d]) // "[SOB]"
const ENCODED_TRAILER = Uint8Array([0x5b,0x45,0x4f,0x42,0x5d]) // "[EOB]"
const MAGIC_COMPRESSED = 0xDD; const MAGIC_UNCOMPRESSED = 0x22
const HEADER_SIZE = 25
const SESSION_CONTROL = 0; const SESSION_CHAT = 1
const SESSION_RPC = 2; const SESSION_POSITION = 7
```

**Callsign helpers** `src/engine/ddt2.ts:22`
```ts
function padCallsign(call: string): Uint8Array   // pad/truncate to 8 bytes with 0x7E '~'
function trimCallsign(bytes: Uint8Array): string  // strip 0x7E, UTF-8 decode
```

**Compression** `src/engine/ddt2.ts:56`
```ts
async function deflate(data: Uint8Array): Promise<Uint8Array>  // CompressionStream('deflate')
async function inflate(data: Uint8Array): Promise<Uint8Array>  // DecompressionStream('deflate')
```

**Frame codec** `src/engine/ddt2.ts:72`
```ts
async function encodeFrame(frame: DDT2Frame, compress = true): Promise<Uint8Array>
// headerBase layout (big-endian): [magic:1][seq:2][sessionId:1][type:1][checksum:2][length:2][s_station:8][d_station:8]
// CRC covers headerBase (checksum field zeroed) + (compressed) data
// yEnc-encodes raw frame, wraps with ENCODED_HEADER/TRAILER

async function decodeFrame(wireData: Uint8Array): Promise<DDT2Frame | null>
// finds SOB/EOB, yDecodes, validates magic, CRC, inflates if needed; returns null on any mismatch
```

**Internals** `concat`, `findSequence`, `drain` `src/engine/ddt2.ts:34` — private helpers.

---

### CRC (`crc.ts`)

CRC-CCITT (poly `0x1021`) used by DDT2 header checksum.

```ts
// src/engine/crc.ts:18
function computeCrc(data: Uint8Array): number   // init 0, updateCrc, append 2 zero bytes
function verifyCrc(data: Uint8Array, expected: number): boolean
// private: updateCrc(crc, data) — bitwise implementation src/engine/crc.ts:1
```

---

### YEnc (`yencode.ts`)

Escapes banned bytes + `0x3D` (`=`) by prefixing `=` and adding offset `64`.

```ts
// src/engine/yencode.ts:8
const OFFSET = 64; const ESCAPE = 0x3d
const DEFAULT_BANNED = Uint8Array([0x11,0x13,0x1a,0x00,0x84,0xe7,0xfd,0xfe,0xff,0xc0,0xdb])

function yencode(data: Uint8Array, banned = DEFAULT_BANNED): Uint8Array
function ydecode(data: Uint8Array): Uint8Array
```

---

### Callsign (`callsign.ts`)

```ts
// src/engine/callsign.ts:6
const CALLSIGN_SHAPE = /^[A-Za-z]{1,2}\d[A-Za-z0-9]{1,4}([-/][A-Za-z0-9]{1,3})?$/
function isValidCallsign(value: string): boolean  // rejects corrupted/garbled station names
```

---

### Control Channel (`control.ts`)

Wire format for **DDT2 session 0** (session negotiation & teardown).

```ts
// src/engine/control.ts:5
const CONTROL_TYPE_PING = 0; const CONTROL_TYPE_END = 1
const CONTROL_TYPE_ACK = 2;  const CONTROL_TYPE_NEW_BASE = 3
const SESSION_TYPE_GENERAL = 1; const SESSION_TYPE_SOCKET = 4
const SESSION_TYPE_FILEXFER = 5; const SESSION_TYPE_FORMXFER = 6; const SESSION_TYPE_RPC = 7

function newSessionControlType(sessionType: number): number // CONTROL_TYPE_NEW_BASE + sessionType
function encodeNewSessionRequest(localId: number, name: string): Uint8Array // [localId:1][name:utf8]
function decodeNewSessionRequest(data: Uint8Array): { localId:number; name:string } | null
function encodeSessionAck(requesterId: number, ownId: number): Uint8Array   // [requesterId, ownId]
function decodeSessionAck(data: Uint8Array): { requesterId:number; peerId:number } | null
function encodeSessionEnd(id: number): Uint8Array   // utf8(String(id))
function decodeSessionEnd(data: Uint8Array): number | null
```

---

### Transport (`transport.ts`)

Accumulates serial bytes, extracts `[SOB]…[EOB]` frames, decodes them, and dispatches GPS/raw-text fallbacks.

```ts
// src/engine/transport.ts:5
class Transport {
  constructor(serial: RadioSerial)
  setOnFrame(cb: (frame: DDT2Frame)=>void): void
  setOnDecodeError(cb: (rawFrame: Uint8Array)=>void): void
  setOnGpsString(cb: (text: string)=>void): void
  setOnRawText(cb: (text: string)=>void): void
  async sendFrame(frame: DDT2Frame, compress = true): Promise<void>
  get hasBufferedData(): boolean
  get bufferedLength(): number
  // private:
  // onSerialData(data) — concat + parseFrames + GPS/raw-text match (skips if SOB buffered)
  // parseFrames() — while loop, slice SOB..EOB inclusive, async decodeFrame
  // matchGps() — NMEA $$CRC GPS-A regexes
  // matchRawText() — /^([^\r\n]{5,})\r\n?/
}
```

---

### TransportManager (`transport-manager.ts`)

Multi-port facade: owns `Map<string, {serial,transport}>` for serial ports and `Map<string, RatflectorConnection>` for ratflector ports.

```ts
// src/engine/transport-manager.ts:13
type FrameHandler = (frame: DDT2Frame, portName: string) => void

class TransportManager {
  setOnFrame(handler: FrameHandler): void
  get connectedPorts(): string[]
  isConnected(name: string): boolean
  getConnection(name: string): RadioSerial | RatflectorConnection | undefined
  isPortConnected(portName: string): boolean
  async connectSerial(name: string, config: PortConfig): Promise<void>
  //  - requestPort, new RadioSerial+Transport, wire onFrame/onGpsString/onRawText/onDecodeError
  //  - connect at config.serial.baudRate, send warmup frame (type 254, session 0, 16×0x01, uncompressed)
  async connectRatflector(name: string, config: PortConfig): Promise<void>
  async disconnect(name: string): Promise<void>
  disconnectAll(): void
  async sendFrame(frame: DDT2Frame, portName?: string): Promise<void>
  //  private handleRawGps(text, portName) — parseIcomGps/parseRawNmeaGps → station + position + forwardChatText
  //  private handleRawText(text, portName) — callsign regex → updateStation, synth chat frame
  //  private forwardChatText(callsign, text, portName)
}
```

Warmup frame `src/engine/transport-manager.ts:146`:
```ts
{ header:{magic:0x22, seq:0, sessionId:0, type:254, sourceStation:'!', destStation:'!', length:16}, data: Uint8Array(16).fill(0x01) }
```

---

### SessionManager (`session-mgr.ts`)

Implements **control-channel session negotiation** (the most subtle layer). Fixed slots `0=control,1=chat,2=rpc`; dynamic sessions start at `3`.

**Retry constants** `src/engine/session-mgr.ts:41`
```ts
const NEW_SESSION_RETRIES = 10
const NEW_SESSION_RETRY_MS_FIRST = 5000
const NEW_SESSION_RETRY_MS_REST  = 15000
const END_SESSION_RETRIES = 3
const END_SESSION_RETRY_MS = 10000
```

**Types** `src/engine/session-mgr.ts:17`
```ts
type FrameCallback = (frame: DDT2Frame, portName?: string) => Promise<void>
type IncomingSessionCallback = (localId:number, sessionType:number, sourceStation:string, name:string)=>void
type RpcFrameCallback = (frame: DDT2Frame)=>Promise<void>
interface SessionRecord { localId:number; remoteId:number|null; destStation:string; sessionType:number; name:string; state:'sync'|'open'|'closed' }
```

**Public API** `src/engine/session-mgr.ts:48`
```ts
class SessionManager {
  setOutgoingCallback(cb: FrameCallback): void
  setOnOutgoing(cb: (frame:DDT2Frame, portName?:string)=>void): void
  setIsPortConnected(cb: (portName:string)=>boolean): void
  setOnMissingRemoteId(cb: (localId:number, hasRecord:boolean)=>void): void
  setOnRpcFrame(cb: RpcFrameCallback): void
  setOnIncomingSession(cb: IncomingSessionCallback): void
  setStation(callsign: string): void
  getStation(): string
  heardOnPort(callsign: string, portName: string): void
  getPortForStation(callsign: string): string | undefined
  async incoming(frame: DDT2Frame): Promise<void>  // routes session 0 → handleControlFrame, else RPC check
  async outgoing(frame: DDT2Frame, portName?: string): Promise<void>
  //  - sets sourceStation, defaults destStation to CQCQCQ
  //  - resolves port via stationPorts[destStation] if isPortConnected
  //  - rewrites sessionId: localId → remoteId for negotiated sessions (excludes 0,1,2)
  async startSession(sessionType:number, destStation:string, name=''): Promise<number>
  //  - allocates localId, state 'sync', loops NEW_SESSION_RETRIES with 5s/15s waits, throws on failure
  async endSession(localId:number): Promise<void>
  //  - sends CONTROL_TYPE_END with remoteId||localId, waits END_SESSION_RETRIES×10s, deletes record
  getSessionDest(localId:number): string | undefined
  getSessionByRemoteId(remoteId:number, sourceStation?:string): SessionRecord|undefined
  getHeardStations(): Map<string,number>
  manualHeardStation(callsign:string): void
  generateSessionId(): number   // increments nextSessionId (3..254), recycles on overflow
  setRetryTiming(opts:{newSessionRetries?, newSessionRetryMsFirst?, newSessionRetryMsRest?, endSessionRetries?, endSessionRetryMs?}): void
  // private handleControlFrame, sendControlFrame
}
```

---

### ChatEngine (`chat.ts`)

Stateless broadcast chat on `SESSION_CHAT = 1`. Handles ping/status/GPS side-effects.

```ts
// src/engine/chat.ts:11
const CHAT_TYPE_DEF = 0; const CHAT_TYPE_PING_REQ = 1; const CHAT_TYPE_PING_RSP = 2
const CHAT_TYPE_PING_ERQ = 3; const CHAT_TYPE_PING_ERS = 4; const CHAT_TYPE_STATUS = 5

type ChatMessageCallback = (from:string,to:string,text:string)=>void
type PingCallback = (from:string,to:string,type:string,data:string)=>void
type GpsFixCallback = (from:string,lat:number,lon:number)=>void
type StatusCallback = (from:string,status:number,message:string)=>void

class ChatEngine {
  constructor(sessionManager: SessionManager)
  setOnMessage(cb: ChatMessageCallback): void
  setOnPing(cb: PingCallback): void
  setOnGpsFix(cb: GpsFixCallback): void
  setOnStatus(cb: StatusCallback): void
  setPingInfo(info: string): void
  async handleIncoming(frame: DDT2Frame): Promise<void>
  //  DEF: skip $GP/$$CRC as chat, fire onMessage + parseGps→onGpsFix
  //  PING_REQ: onPing, reply PING_RSP (random 0-5s delay if CQCQCQ) + sendStatus
  //  PING_RSP/ERS: onPing, resolve pingEchoHandlers on ERS
  //  PING_ERQ: echo back same data (0-10s delay if CQCQCQ)
  //  STATUS: parse statusByte + text → onStatus
  async sendText(text:string, dest='CQCQCQ', portName?:string): Promise<void>
  async sendPing(dest:string, data?:string, portName?:string): Promise<void>
  async sendPingEcho(dest:string, data:string, callback?:(...args:unknown[])=>void, ...cbdata:unknown[]): Promise<void>
  async sendStatus(message:string): Promise<void>  // sends `1${message}` as STATUS to CQCQCQ
  // private getPingResponse(), sendRaw(dest,type,data,portName)
}
```

---

### FileTransferEngine (`file.ts`)

Windowed, reliable file transfer over a **negotiated** session (`SESSION_TYPE_FILEXFER = 5`). Uses `deflate` once per file, then 1 KB blocks with `DAT(4)/ACK(1)/REQACK(5)` and mod-256 sequence numbers.

**Constants** `src/engine/file.ts:6`
```ts
const FILE_BLOCK_SIZE = 1024
const FILE_WINDOW_SIZE = 8           // capped to floor(4096/FILE_BLOCK_SIZE) → 4 for default
const FILE_MAX_RETRIES = 10
const FILE_MIN_TIMEOUT_MS = 4000     // per-attempt: 4000*(attempt+1)
const FILE_OFFER_RESPONSE_TIMEOUT_MS = 20000
const STATEFUL_TYPE_ACK = 1; const STATEFUL_TYPE_DAT = 4; const STATEFUL_TYPE_REQACK = 5
```

**Callback types** `src/engine/file.ts:21`
```ts
type FileTransferProgressCallback = (filename:string, transferred:number, total:number, sessionId:number)=>void
type FileOfferCallback = (filename:string, size:number, sessionId:number, fromStation:string)=>void
type FileTransferDropCallback = (sessionId:number, fromStation:string, frameType:number)=>void
```

**Class** `src/engine/file.ts:54`
```ts
class FileTransferEngine {
  constructor(sessionManager: SessionManager) // registers setOnIncomingSession for FILEXFER → awaiting-offer
  setOnProgress(cb: FileTransferProgressCallback): void
  setOnOffer(cb: FileOfferCallback): void
  setOnDrop(cb: FileTransferDropCallback): void
  async handleIncoming(frame: DDT2Frame): Promise<void>
  //  DAT+awaiting-offer → parse [u32LE size][filename], fire onOffer, auto-accept ("OK")
  //  DAT+awaiting-response → queue pendingReplies
  //  DAT+transferring → deliverInOrder (out-of-order map, inflate on completion, endSession)
  //  ACK → merge into pendingAcked, wake ackWaiters
  //  REQACK → reply ACK with intersection of requested seqs and recvList
  async sendFile(filename:string, data:Uint8Array, dest:string, onSessionId?:(sessionId:number,compressedSize:number)=>void): Promise<number>
  //  startSession, deflate, sendReliable([offer]), waitForData(20s), handle OK/RESUME, chunk remaining, sendReliable(chunks, onWindowSent→onProgress), endSession
  async acceptOffer(sessionId:number): Promise<void> // sendReliable([ "OK" ])
  cancelTransfer(sessionId:number): void             // phase='failed', wake waiters, endSession
  getTransfer(sessionId:number): TransferState|undefined
  getCompletedData(sessionId:number): Uint8Array|null // only if phase==='complete'
  // private: deliverInOrder, isCancelled, nextSeq, sendDataBlock, sendReqAck,
  //          waitForAckSeqs, waitForData, sendReliable(state,chunks,onWindowSent)
}
```

Offer wire format `src/engine/file.ts:423`: `Uint8Array(4 + filename.length)` with `DataView.setUint32(0, compressedLength, true)`.

---

### RPCEngine (`rpc.ts`)

Fixed session `SESSION_RPC = 2`, single request/ack per call, 30 s timeout. Dict encoding uses control separators.

```ts
// src/engine/rpc.ts:9
const RPC_TYPE_REQUEST = 0; const RPC_TYPE_ACK = 1
const UNIT_SEPARATOR = '\x1f'; const RECORD_SEPARATOR = '\x1e'; const GROUP_SEPARATOR = '\x1d'
const JOB_FILE_LIST = 'RPCFileListJob'; const JOB_PULL_FILE = 'RPCPullFileJob'; const JOB_DELETE_FILE = 'RPCDeleteFileJob'
const RPC_TIMEOUT_MS = 30000

interface FileProvider { list():Promise<RemoteFileEntry[]>; get(name:string):Promise<Uint8Array|null>; remove(name:string):Promise<boolean> }
function formatFileListInfo(sizeBytes:number, mtimeMs:number): string
//  → "512 B (YYYY-MM-DD HH:MM:SS)" or "N KB (...)" — 4-token format required by Python peer

function encodeDict(fields: Record<string,string>): string  // key\x1fvalue\x1e...
function decodeDict(text: string): Record<string,string>

type PullTriggeredSendCallback = (filename:string,size:number,station:string)=>(sessionId:number,compressedSize?:number)=>void
type PullSendErrorCallback = (filename:string,station:string,error:unknown)=>void
type JobServedCallback = (jobType:string,requester:string,reply:Record<string,string>)=>void
type JobErrorCallback  = (jobType:string,requester:string,error:unknown)=>void

class RPCEngine {
  constructor(sessionManager: SessionManager)
  setFileTransferEngine(fileTransfer: FileTransferEngine): void
  setFileProvider(provider: FileProvider): void
  setPullGate(gate: ()=>boolean): void            // allowRemoteFileTransfers
  setDeletePassword(getPassword: ()=>string): void // remoteDeletePassword
  setOnPullSend(cb: PullTriggeredSendCallback): void
  setOnPullSendError(cb: PullSendErrorCallback): void
  setOnJobServed(cb: JobServedCallback): void
  setOnJobError(cb: JobErrorCallback): void
  async handleIncoming(frame: DDT2Frame): Promise<void>
  //  ACK → resolve pendingCalls[seq]; REQUEST → parse "jobType\x1d dict", handleJob, send ACK
  //  handleJob: FILE_LIST→list, PULL_FILE→gate+get+fire-and-forget sendFile, DELETE_FILE→passwd+remove
  async listFiles(dest:string, portName?:string): Promise<RemoteFileEntry[]>
  async pullFile(dest:string, filename:string, portName?:string): Promise<{ok:boolean;message:string}>
  async deleteFile(dest:string, filename:string, password:string, portName?:string): Promise<{ok:boolean;message:string}>
  // private submit(jobType,args,dest,portName): Promise<Record<string,string>> — ident 0..65535, 30s timeout
  // private sendRaw(dest,type,seq,payload,portName)
}
```

---

### RatflectorConnection (`ratflector.ts`)

WebSocket → TCP bridge client (via `ratflector-bridge.py`).

```ts
// src/engine/ratflector.ts:4
type RatflectorStatus = 'disconnected'|'connecting'|'connected'|'error'
const AUTH_TIMEOUT = 10000

class RatflectorConnection {
  setOnFrame(cb:(frame:DDT2Frame)=>void): void
  setOnStatus(cb:(status:RatflectorStatus,message:string)=>void): void
  setOnDecodeError(cb:(rawFrame:Uint8Array)=>void): void
  async connect(host:string, port:number, callsign:string, password:string, bridgeUrl?:string): Promise<void>
  //  bridge default ws://localhost:9001, url `${bridge}/?host=${host}&port=${port}`
  //  binaryType='arraybuffer', onmessage handles auth codes (100/101/102/200) then parseFrames
  disconnect(): void
  get isConnected(): boolean // ws OPEN && authenticated
  async sendFrame(frame: DDT2Frame): Promise<void> // encodeFrame → ws.send
  // private waitForAuthLine(): Promise<{code,message}|null> — queue or timeout AUTH_TIMEOUT
  // private doAuth(callsign,password) — welcome 100/101, USER, 200/102, PASS, 200
  // private parseFrames() — SOB/EOB loop, decodeFrame
}
```

---

### GPS (`gps.ts`)

Parses NMEA, GPS-A / APRS, ICOM `$$CRC` wrappers; computes distance/bearing/Maidenhead.

```ts
// src/engine/gps.ts:42
function parseNmea(sentence: string): GPSPosition|null
//  $GPGGA (lat/lon/alt), $GPRMC (lat/lon/speed/course), $GPGLL (lat/lon); checksum warn-only

// src/engine/gps.ts:174
function parseAprs(text: string): GPSPosition|null              // $$CRC wrapper → GPS-A body
function parseAprsPosition(text: string): GPSPosition|null      // bare GPS-A body
function parseIcomGps(text:string): {callsign:string; position?:GPSPosition; message?:string}|null
function parseRawNmeaGps(text:string): {callsign:string; position?:GPSPosition; message?:string}|null
function parseGps(text:string): GPSPosition|null                // parseNmea ?? parseAprs ?? parseAprsPosition

// src/engine/gps.ts:244
function distance(a:GPSPosition,b:GPSPosition): number  // haversine, meters, R=6371000
function bearingTo(a:GPSPosition,b:GPSPosition): number // 0..360°
function toMaidenhead(lat:number,lon:number): string    // 6-char QTH locator, clamped
// private: gpsaChecksum, nmeaValueToDeg, warnIfNmeaChecksumBad, splitGpsaFrame, parseGpsaBody, looksLikeAprsData
// const GPS_A_BODY regex src/engine/gps.ts:117, APRS_DATA_TYPE_IDS set src/engine/gps.ts:123
```

---

### Local Files (`local-files.ts`)

File System Access API wrapper with IndexedDB persistence for the directory handle.

```ts
// src/engine/local-files.ts:10
interface LocalFileEntry { name:string; size:number; lastModified:number }
const DB_NAME='drats-web'; const STORE_NAME='handles'; const FOLDER_HANDLE_KEY='sharedFolder'

function isSupported(): boolean  // 'showDirectoryPicker' in window
async function pickFolder(): Promise<FileSystemDirectoryHandle> // showDirectoryPicker + idbSet
async function getStoredFolder(): Promise<FileSystemDirectoryHandle|null> // idbGet
async function forgetFolder(): Promise<void>
async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean>   // queryPermission readwrite
async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> // requestPermission (needs user gesture)
async function listFolder(handle: FileSystemDirectoryHandle): Promise<LocalFileEntry[]> // sorted by name
async function readFolderFile(handle: FileSystemDirectoryHandle, name:string): Promise<Uint8Array|null>
async function writeFolderFile(handle: FileSystemDirectoryHandle, name:string, data:Uint8Array): Promise<void>
async function removeFolderFile(handle: FileSystemDirectoryHandle, name:string): Promise<boolean>
// private: openDb, idbGet, idbSet — IndexedDB helpers src/engine/local-files.ts:16
```

Global augmentation `src/types/file-system-access.d.ts:7` declares `window.showDirectoryPicker` and `FileSystemHandle.queryPermission/requestPermission`.

---

### AuthenticatedTransport (`authenticated-transport.ts`)

Legacy/placeholder transport with auth gate. Prefer `Transport` / `TransportManager`.

```ts
// src/engine/authenticated-transport.ts:11
interface TransportConfig { baudRate:number; dataBits:number; parity:'none'|'even'|'odd'; flowControl?:boolean }
class AuthenticatedTransport {
  async connect(port: SerialPort): Promise<void> // setupFlowControl + authenticate
  disconnect(): void
  async authenticate(): Promise<boolean> // checks useAuthStore.isAuthRequired/isAuthenticated
  setupFlowControl(): Promise<void>      // logs flowControl from useConfigStore
  sendFrame(frame: Uint8Array): void
  onReceive(data: Uint8Array): void
}
```

---

### Barrel (`index.ts`)

Re-exports public engine surface `src/engine/index.ts:1`:

```ts
export { RadioSerial } from './serial'
export type { RadioSerialConfig } from './serial'
export { Transport } from './transport'
export { AuthenticatedTransport } from './authenticated-transport'
export { SessionManager } from './session-mgr'
export { ChatEngine } from './chat'
export { FileTransferEngine } from './file'
export { computeCrc, verifyCrc } from './crc'
export { yencode, ydecode } from './yencode'
export { encodeFrame, decodeFrame, ENCODED_HEADER, ENCODED_TRAILER, MAGIC_COMPRESSED, MAGIC_UNCOMPRESSED, HEADER_SIZE, SESSION_CONTROL, SESSION_CHAT } from './ddt2'
export { parseGps, parseNmea, parseAprs, distance, bearingTo, toMaidenhead } from './gps'
export { XON, XOFF } from './serial'
export { CHAT_TYPE_DEF, CHAT_TYPE_PING_REQ, CHAT_TYPE_PING_RSP, CHAT_TYPE_PING_ERQ, CHAT_TYPE_PING_ERS, CHAT_TYPE_STATUS } from './chat'
export { FILE_BLOCK_SIZE, FILE_WINDOW_SIZE, FILE_MAX_RETRIES, FILE_MIN_TIMEOUT_MS } from './file'
export { SESSION_TYPE_GENERAL, SESSION_TYPE_SOCKET, SESSION_TYPE_FILEXFER, SESSION_TYPE_FORMXFER, SESSION_TYPE_RPC } from './control'
export { RatflectorConnection } from './ratflector'
export type { RatflectorStatus } from './ratflector'
export { TransportManager } from './transport-manager'
```

---

## State Layer — Zustand Stores (`src/store/`)

All stores use `zustand` `create`. Persisted stores use `zustand/middleware` `persist` with `localStorage`.

### `useConfigStore` `src/store/config-store.ts:14`

Persisted as `drats-config`, version `3` (`CURRENT_VERSION`), `migrate: () => DEFAULT_CONFIG`.

```ts
interface ConfigState {
  config: AppConfig
  updateConfig(partial: Partial<AppConfig>): void
  updatePort(index:number, port: Partial<AppConfig['ports'][0]>): void
  addPort(port: AppConfig['ports'][0]): void
  removePort(index:number): void
  resetConfig(): void
}
const DEFAULT_CONFIG: AppConfig = {
  myCallsign:'', myName:'', signOnMessage:'', signOffMessage:'', pingInfo:'',
  units:'imperial', showUtc:false,
  ports:[
    { enabled:true, type:'serial', settings:'9600', sniff:false, raw:false, name:'Radio',
      serial:{baudRate:9600,dataBits:8,stopBits:1,parity:'none',flowControl:'xon/xoff'} },
    { enabled:true, type:'ratflector', settings:'', sniff:false, raw:false, name:'RAT',
      ratflector:{host:'ref.d-rats.com',port:9000,callsign:'',password:''} }
  ],
  mapCenter:[41.9,12.5], mapZoom:8, myPosition:undefined, autoConnect:false,
  allowRemoteFileTransfers:true, remoteDeletePassword:''
}
```

### `useStationStore` `src/store/station-store.ts:6` — persisted `drats-stations`

```ts
interface StationState {
  stations: Record<string, Station>
  ownPosition?: GPSPosition
  updateStation(callsign:string, partial:Partial<Station>): void
  setStationPosition(callsign:string, pos:GPSPosition): void
  setStationStatus(callsign:string, status:StationStatus): void
  setOwnPosition(pos:GPSPosition): void
  removeStation(callsign:string): void
  clearStations(): void
}
```

### `useChatStore` `src/store/chat-store.ts:5` — persisted `drats-chat`

```ts
interface ChatState { messages: ChatMessage[]; addMessage(msg:ChatMessage):void; clearMessages():void }
```

### `usePortStore` `src/store/port-store.ts:5` — **not** persisted (ephemeral)

```ts
type PortStatus = 'disconnected'|'connecting'|'connected'|'error'
interface PortState {
  statuses: Record<string, PortStatus>
  messages: Record<string,string>
  setStatus(name:string, status:PortStatus, message?:string): void
  getStatus(name:string): PortStatus // default 'disconnected'
  getMessage(name:string): string
}
```

### `useFileStore` `src/store/file-store.ts:4` — **not** persisted

```ts
interface FileState {
  transfers: FileTransferItem[]
  addTransfer(item:FileTransferItem): void
  updateTransfer(id:string, partial:Partial<FileTransferItem>): void
  removeTransfer(id:string): void
  clearTransfers(): void
}
```

### `useRpcStore` `src/store/rpc-store.ts:10` — **not** persisted

```ts
interface StationListing { status:'disconnected'|'connecting'|'connected'|'error'; files: RemoteFileEntry[]; error:string }
interface RpcState {
  listings: Record<string, StationListing>
  selectedStation: string; selectedPort: string
  setSelectedStation(station:string): void
  setSelectedPort(port:string): void
  setConnecting(station:string): void
  setConnected(station:string, files:RemoteFileEntry[]): void
  setError(station:string, error:string): void
  setDisconnected(station:string): void
}
```

### `useLocalFilesStore` `src/store/local-files-store.ts:13` — **not** persisted (handle in IndexedDB)

```ts
interface LocalFilesState {
  handle: FileSystemDirectoryHandle|null
  folderName: string|null
  permission: 'unknown'|'granted'|'needs-permission'
  files: LocalFileEntry[]; loading:boolean; error:string
  init(): Promise<void>            // getStoredFolder + hasPermission + refresh
  pick(): Promise<void>            // pickFolder + refresh
  reconnect(): Promise<void>       // requestPermission + refresh (needs user gesture)
  refresh(): Promise<void>         // listFolder
  addFile(name:string, data:Uint8Array): Promise<void>   // writeFolderFile + refresh
  removeFile(name:string): Promise<boolean>              // removeFolderFile + refresh
}
```

### `usePingStore` `src/store/ping-store.ts:4`

```ts
interface PingState { pings: PingInfo[]; addPing(ping:PingInfo):void; clearPings():void }
// addPing keeps last 50
```

### `useSnifferStore` `src/store/sniffer-store.ts:12`

```ts
interface SniffedPacket { id:number; timestamp:number; direction:'rx'|'tx'; data:Uint8Array }
const MAX_PACKETS = 5000
interface SnifferState {
  packets: SniffedPacket[]; paused:boolean; capturing:boolean; capturedPackets: SniffedPacket[]
  addPacket(dir:'rx'|'tx', data:Uint8Array): void // slices to 2048, respects paused, appends to capturedPackets if capturing
  clearPackets(): void
  togglePause(): void
  startCapture(): void  // capturing=true, capturedPackets=[]
  stopCapture(): void
  saveCapture(): void   // Blob text/plain with hex+ascii, downloads drats-capture-*.txt
}
```

### `useEventStore` `src/store/event-store.ts:3`

```ts
interface EventLogEntry { time:number; text:string; type:'chat-in'|'chat-out'|'file'|'gps'|'raw'|'frame'|'ping' }
const MAX_EVENTS = 1000
interface EventState { events: EventLogEntry[]; addEvent(entry:EventLogEntry):void; clearEvents():void }
```

### `useRatflectorStore` `src/store/ratflector-store.ts:6`

```ts
type ConnectionStatus = 'disconnected'|'connecting'|'connected'|'error'
interface RatflectorState {
  status: ConnectionStatus; statusMessage:string; host:string; port:number; pings: PingInfo[]
  setStatus(status:ConnectionStatus, message?:string):void; setHost(host:string):void; setPort(port:number):void
  addPing(ping:PingInfo):void; clearPings():void // last 100
}
```

### `useAuthStore` `src/store/auth-store.ts:11` — persisted `d-rats-auth` (partialize: `currentUser,isAuthRequired,trustLocal`)

```ts
interface AuthUser { username:string; password:string; displayName?:string; email?:string }
interface AuthState {
  currentUser: AuthUser|null; isAuthenticated:boolean; isAuthRequired:boolean; trustLocal:boolean; users: AuthUser[]
  setUser(user:AuthUser): void; logout(): void
  login(username:string,password:string): Promise<boolean> // case-insensitive username, exact password
  registerUser(user:AuthUser): void; updateConfig(config:Partial<AuthState>):void; clearCredentials():void
}
const DEFAULT_USERS: AuthUser[] = [
  {username:'admin',password:'admin',displayName:'Administrator',email:'admin@d-rats.app'},
  {username:'guest',password:'guest',displayName:'Guest User',email:'guest@example.com'},
]
```

### Additional stores

| Store | File | Persist key | Notes |
|-------|------|-------------|-------|
| `useRatflectorListStore` | `src/store/ratflector-list-store.ts:1` | — | Ratflector station list (dynamic) |
| `useConfigStore` version | `src/store/config-store.ts:14` | `drats-config` v3 | `migrate` resets to default |

---

## Hooks (`src/hooks/`)

### `useDratsEngine` `src/hooks/useDratsEngine.ts:23`

Central wiring hook — creates and interconnects `TransportManager`, `SessionManager`, `ChatEngine`, `FileTransferEngine`, `RPCEngine`. Returns refs + connect helpers.

```ts
function useDratsEngine(): {
  transportMgrRef: RefObject<TransportManager|null>
  sessionMgrRef: RefObject<SessionManager|null>
  chatRef: RefObject<ChatEngine|null>
  fileRef: RefObject<FileTransferEngine|null>
  rpcRef: RefObject<RPCEngine|null>
  connectPort(name:string, config:PortConfig): Promise<void> // initEngine, connectSerial/Ratflector, sendStatus(signOnMessage)
  disconnectPort(name:string): Promise<void>
}
```

Key behaviors `src/hooks/useDratsEngine.ts:37`:
- `handleFrame` — callsign validates `sourceStation`, `sessionMgr.heardOnPort` + `incoming`, `updateStation(lastHeard)`, rewrites `sessionId` via `getSessionByRemoteId` for negotiated sessions, logs `[Frame]` to `useEventStore`, routes to `chat`/`rpc`/`position`/`file`.
- `initEngine` (once) — instantiates managers/engines, wires `setOnOutgoing` (frame log), `setIsPortConnected`, `setOnMissingRemoteId`, chat callbacks (`addChatMessage`, `addPing`, `setStationPosition`, `updateStation`), file callbacks (`addTransfer`, `updateTransfer`, drop log), RPC `FileProvider` backed by `useLocalFilesStore` + `formatFileListInfo`, `setOnPullSend` (creates `FileTransferItem` state `negotiating`), `setOnJobServed/onJobError` (event log), `setOnFrame` + `setOutgoingCallback → transportMgr.sendFrame`.
- Keeps `sessionMgr.station` in sync with `config.myCallsign` via `useEffect` `src/hooks/useDratsEngine.ts:301`.
- Auto-connects enabled ports once if `config.autoConnect` `src/hooks/useDratsEngine.ts:314`.

---

## Utilities (`src/utils/`)

### `format.ts` `src/utils/format.ts:1`
```ts
function formatFileSize(bytes:number): string
// <1024 → "N B", <1MiB → "N.N KB", else "N.N MB"
```

---

## Components (`src/components/`) — Props Surface

All components are function components with no exported prop interfaces (props are inline or none). This table documents their store/engine dependencies.

| Component | File | Key Props / Dependencies |
|-----------|------|--------------------------|
| `Layout` | `src/components/Layout.tsx:1` | Tab state, renders `ChatPanel`, `StationsList`, `MapPanel`, `FileTransfer`, `ConfigPanel`, etc. |
| `ChatPanel` | `src/components/ChatPanel.tsx:1` | `useChatStore`, `useConfigStore`, `useDratsEngine.chatRef.sendText/sendPing` |
| `StationsList` | `src/components/StationsList.tsx:1` | `useStationStore`, `usePingStore`, `chatRef` for Ping/Position requests |
| `MapPanel` | `src/components/MapPanel.tsx:1` | `useStationStore`, `leaflet` + `react-leaflet` |
| `SnifferPanel` | `src/components/SnifferPanel.tsx:1` | `useSnifferStore`, `useEventStore` — hex/ascii view |
| `ConfigPanel` | `src/components/ConfigPanel.tsx:1` | `useConfigStore` — serial/ratflector ports, `allowRemoteFileTransfers`, `remoteDeletePassword` |
| `SerialConnect` | `src/components/SerialConnect.tsx:1` | `useDratsEngine.connectPort/disconnectPort`, `usePortStore`, `useConfigStore` |
| `FileTransfer` | `src/components/FileTransfer.tsx:1` | `useFileStore` transfers list + `SharedFiles` + `RemoteBrowser` |
| `SharedFiles` | `src/components/SharedFiles.tsx:1` | `useLocalFilesStore` — pick/refresh/delete/upload (upload → `fileRef.sendFile`) |
| `RemoteBrowser` | `src/components/RemoteBrowser.tsx:1` | `useRpcStore`, `useStationStore`, `rpcRef.listFiles/pullFile/deleteFile` |
| `EventLog` | `src/components/EventLog.tsx:1` | `useEventStore` |
| `PingPanel` | `src/components/PingPanel.tsx:1` | `usePingStore` |
| `RatflectorPanel` | `src/components/RatflectorPanel.tsx:1` | `useRatflectorStore`, ratflector connect UI |
| `InfoPanel` / `WikiPanel` / `AuthPanel` | `src/components/InfoPanel.tsx:1` etc. | Static / markdown + `useAuthStore` |

---

## Error Handling & Diagnostics

- **DDT2 decode failures** — `Transport.setOnDecodeError` `src/engine/transport.ts:27` and `RatflectorConnection.setOnDecodeError` `src/engine/ratflector.ts:28` emit `[Frame] Failed to decode ... (CRC/yEnc/zlib mismatch)` to `useEventStore`.
- **Missing remote session id** — `SessionManager.setOnMissingRemoteId` `src/engine/session-mgr.ts:109` emits `[Session] Sending on local session ... with no confirmed peer id yet`.
- **Dropped file frames** — `FileTransferEngine.setOnDrop` `src/engine/file.ts:108` emits `[File] Dropped a type=... frame for session ...`.
- **RPC job diagnostics** — `RPCEngine.setOnJobServed/onJobError` `src/engine/rpc.ts:158` and `setOnPullSendError` emit `[RPC]` / `[File] Send ... failed` to `useEventStore`.
- **Outgoing frame log** — `SessionManager.setOnOutgoing` `src/hooks/useDratsEngine.ts:126` and `handleFrame` `src/hooks/useDratsEngine.ts:71` emit `[Frame] →/← session=... type=... src→dst`.
- **XON/XOFF** — `RadioSerial` filters `0x11/0x13` in read loop `src/engine/serial.ts:292`; `send` respects `xonState` with per-frame 15 s budget `src/engine/serial.ts:221`.
- **Callsign validation** — `handleFrame` `src/hooks/useDratsEngine.ts:43` drops frames with `!isValidCallsign(sourceStation)`.

---

*For wire-format details see `docs/protocols.md`; for system architecture see `docs/architecture.md`.*
