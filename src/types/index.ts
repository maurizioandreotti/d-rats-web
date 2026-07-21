export interface Station {
  callsign: string
  status: StationStatus
  lastHeard: number
  position?: GPSPosition
  port?: string
}

export enum StationStatus {
  Unknown = 0,
  Online = 1,
  Unattended = 2,
  Offline = 9,
}

export interface GPSPosition {
  lat: number
  lon: number
  alt?: number
  speed?: number
  direction?: number
  timestamp?: number
  source?: string
}

export interface ChatMessage {
  id: string
  from: string
  to: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
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
  data: ArrayBuffer
}

export enum SessionType {
  Stateless = 0,
  General = 1,
  FileTransfer = 5,
  FormTransfer = 6,
  RPC = 7,
}

export interface FileTransferItem {
  id: string
  filename: string
  size: number
  transferred: number
  direction: 'send' | 'receive'
  state: 'offer' | 'transferring' | 'complete' | 'error'
  station: string
}

export interface SerialConfig {
  port?: string
  baudRate: number
  dataBits: number
  stopBits: number
  parity: 'none' | 'even' | 'odd'
  flowControl: 'xon/xoff' | 'none'
}

export interface AppConfig {
  myCallsign: string
  serial: SerialConfig
  mapCenter: [number, number]
  mapZoom: number
}
