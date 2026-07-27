export interface Station {
  callsign: string
  status: StationStatus
  lastHeard: number
  position?: GPSPosition
  port?: string
}

export const StationStatus = {
  Unknown: 0,
  Online: 1,
  Unattended: 2,
  Offline: 9,
} as const
export type StationStatus = (typeof StationStatus)[keyof typeof StationStatus]

export interface GPSPosition {
  lat: number
  lon: number
  alt?: number
  speed?: number
  direction?: number
  timestamp?: number
  source?: string
  symbolTableId?: string
  symbolCode?: string
}

export interface ChatMessage {
  id: string
  from: string
  to: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  port?: string
  type?: 'chat' | 'status' | 'system'
}

export interface DDT2Header {
  magic: number
  seq: number
  sessionId: number
  type: number
  checksum: number
  length: number
  sourceStation: string
  destStation: string
}

export interface DDT2Frame {
  header: DDT2Header
  data: Uint8Array
}

export const SessionType = {
  Stateless: 0,
  General: 1,
  FileTransfer: 5,
  FormTransfer: 6,
  RPC: 7,
} as const
export type SessionType = (typeof SessionType)[keyof typeof SessionType]

export interface FileTransferItem {
  id: string
  sessionId: number
  filename: string
  size: number
  transferred: number
  direction: 'send' | 'receive'
  state: 'offer' | 'transferring' | 'complete' | 'error'
  station: string
  timestamp: number
}

export interface RemoteFileEntry {
  name: string
  info: string
}

export interface SerialConfig {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd'
  flowControl: 'xon/xoff' | 'none'
}

export interface RatflectorConfig {
  host: string
  port: number
  callsign: string
  password: string
  bridgeUrl?: string
}

export interface PortConfig {
  enabled: boolean
  type: 'serial' | 'ratflector'
  settings: string
  sniff: boolean
  raw: boolean
  name: string
  // serial-specific
  serial?: SerialConfig
  // ratflector-specific
  ratflector?: RatflectorConfig
}

export interface PingInfo {
  from: string
  to: string
  type: 'request' | 'response' | 'echo_request' | 'echo_response' | 'position_request' | 'position_response'
  data: string
  timestamp: number
}

export interface AppConfig {
  myCallsign: string
  myName: string
  signOnMessage: string
  signOffMessage: string
  pingInfo: string
  units: 'imperial' | 'metric'
  showUtc: boolean
  ports: PortConfig[]
  mapCenter: [number, number]
  mapZoom: number
  myPosition?: GPSPosition
  focusCenter?: [number, number]
  autoConnect: boolean
  // Matches D-RATS's "Remote file transfers" checkbox (prefs.allow_remote_files)
  // — gates RPC pull-file requests from other stations, not listing.
  allowRemoteFileTransfers: boolean
  // Matches D-RATS's remote_admin_passwd — empty means remote delete is
  // always rejected regardless of what a request sends.
  remoteDeletePassword: string
}
