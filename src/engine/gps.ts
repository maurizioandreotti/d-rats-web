import type { GPSPosition } from '../types'

// Checksum mismatches are logged, not fatal — see splitGpsaFrame for why.
function warnIfNmeaChecksumBad(body: string, checksumHex: string | undefined): void {
  if (!checksumHex || !/^[0-9A-Fa-f]{2}/.test(checksumHex)) {
    console.warn('[gps] NMEA sentence missing checksum, parsing anyway:', body.slice(0, 80))
    return
  }
  const hex = checksumHex.slice(0, 2)
  let sum = 0
  // NMEA checksum covers everything between '$' and '*', i.e. skip the leading '$'.
  for (let i = 1; i < body.length; i++) sum ^= body.charCodeAt(i)
  if (sum.toString(16).toUpperCase().padStart(2, '0') !== hex.toUpperCase()) {
    console.warn('[gps] NMEA checksum mismatch, parsing anyway:', body.slice(0, 80))
  }
}

// Icom's GPS-A frame checksum: a reversed CRC-16/CCITT (poly 0x8408, init 0xffff,
// bit-reflected in/out, final complement) computed over the payload after "$$CRCxxxx,".
function gpsaChecksum(data: string): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    let byte = data.charCodeAt(i) & 0xff
    for (let bit = 0; bit < 8; bit++) {
      const flip = ((crc ^ byte) & 0x01) === 0x01
      crc = (crc >>> 1) & 0x7fff
      if (flip) crc ^= 0x8408
      byte = (byte >>> 1) & 0x7f
    }
  }
  return ~crc & 0xffff
}

function nmeaValueToDeg(value: number, dir: string): number {
  const deg = Math.floor(value / 100)
  const minutes = value - deg * 100
  const result = deg + minutes / 60
  return dir === 'S' || dir === 'W' ? -result : result
}

export function parseNmea(sentence: string): GPSPosition | null {
  const trimmed = sentence.trim()

  const parts = trimmed.split('*')
  const body = parts[0]
  if (!body) return null

  const fields = body.split(',')

  if (body.startsWith('$GPGGA')) {
    if (fields.length < 10) return null
    warnIfNmeaChecksumBad(body, parts[1])

    const latRaw = fields[2]
    const latDir = fields[3]
    const lonRaw = fields[4]
    const lonDir = fields[5]
    const altRaw = fields[9]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    const lat = nmeaValueToDeg(parseFloat(latRaw), latDir)
    const lon = nmeaValueToDeg(parseFloat(lonRaw), lonDir)
    const alt = altRaw ? parseFloat(altRaw) : undefined

    return { lat, lon, alt, timestamp: Date.now() }
  }

  if (body.startsWith('$GPRMC')) {
    if (fields.length < 10) return null

    const status = fields[2]
    if (status !== 'A') return null
    warnIfNmeaChecksumBad(body, parts[1])

    const latRaw = fields[3]
    const latDir = fields[4]
    const lonRaw = fields[5]
    const lonDir = fields[6]
    const speedRaw = fields[7]
    const courseRaw = fields[8]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    const lat = nmeaValueToDeg(parseFloat(latRaw), latDir)
    const lon = nmeaValueToDeg(parseFloat(lonRaw), lonDir)
    const speed = speedRaw ? parseFloat(speedRaw) * 1.852 : undefined
    const direction = courseRaw ? parseFloat(courseRaw) : undefined

    return { lat, lon, speed, direction, timestamp: Date.now() }
  }

  if (body.startsWith('$GPGLL')) {
    if (fields.length < 7) return null
    warnIfNmeaChecksumBad(body, parts[1])

    const latRaw = fields[1]
    const latDir = fields[2]
    const lonRaw = fields[3]
    const lonDir = fields[4]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    const lat = nmeaValueToDeg(parseFloat(latRaw), latDir)
    const lon = nmeaValueToDeg(parseFloat(lonRaw), lonDir)

    return { lat, lon, timestamp: Date.now() }
  }

  return null
}

// GPS-A position report body: optional timestamp+type prefix (`@`/`/` + 6 digits +
// `z`/`h`/`/`, or a bare `!`/`=`), lat, optional symbol table id, lon, symbol code,
// free-text comment, optional `/A=nnnnnn` altitude in feet.
const GPS_A_BODY =
  /^(?:[@/]\d{6}[zh/]|[!=])(\d{1,4}\.\d{2})([NS])(.)?(\d{5}\.\d{2})([EW])(.)([^/]*)(?:\/A=(\d{6}))?/

// APRS data type identifiers (leading byte of the payload) covering position,
// object, status, telemetry, weather, etc. reports we either parse above or
// simply don't decode yet — either way, none of these are plain chat text.
const APRS_DATA_TYPE_IDS = new Set(['!', '/', '=', '@', ';', ':', '>', '?', '`', "'", ')', '_', 'T', '$', '%', ',', '#', '*', '&'])

function looksLikeAprsData(data: string): boolean {
  const first = data.trimStart()[0]
  return first !== undefined && APRS_DATA_TYPE_IDS.has(first)
}

function parseGpsaBody(data: string): GPSPosition | null {
  const match = data.match(GPS_A_BODY)
  if (!match) return null

  const [, latRaw, latDir, symTable, lonRaw, lonDir, symCode, , altFeet] = match
  const position: GPSPosition = {
    lat: nmeaValueToDeg(parseFloat(latRaw!), latDir!),
    lon: nmeaValueToDeg(parseFloat(lonRaw!), lonDir!),
    timestamp: Date.now(),
  }

  if (symTable) position.symbolTableId = symTable
  if (symCode) position.symbolCode = symCode
  if (altFeet) position.alt = parseInt(altFeet, 10) * 0.3048

  return position
}

// Splits a "$$CRCxxxx,<rest>" GPS-A frame into its station-id field
// ("CALL>DEST", with or without a following ",PATH" before the data) and its
// data field (whatever follows the first ':'). A digipeater path is optional
// in APRS-style framing, so this doesn't assume a second comma is present.
// Checksum mismatches are logged, not treated as fatal: real serial capture
// can introduce reconstruction artifacts, and silently dropping a station
// because of a checksum quirk is worse than displaying an occasional bad fix.
function splitGpsaFrame(text: string): { stationField: string; data: string } | null {
  const match = text.trim().match(/^\$\$CRC([A-Za-z0-9]{4}),([\s\S]*)$/)
  if (!match) return null

  const [, crcHex, rest] = match
  if (gpsaChecksum(rest!) !== parseInt(crcHex!, 16)) {
    console.warn('[gps] GPS-A checksum mismatch, parsing anyway:', text.slice(0, 80))
  }

  const colonIdx = rest!.indexOf(':')
  if (colonIdx === -1) return null

  const header = rest!.slice(0, colonIdx)
  const commaIdx = header.indexOf(',')
  const stationField = commaIdx === -1 ? header : header.slice(0, commaIdx)

  return { stationField, data: rest!.slice(colonIdx + 1) }
}

export function parseAprs(text: string): GPSPosition | null {
  const frame = splitGpsaFrame(text)
  if (!frame) return null
  return parseGpsaBody(frame.data)
}

export function parseAprsPosition(text: string): GPSPosition | null {
  return parseGpsaBody(text)
}

export function parseIcomGps(
  text: string,
): { callsign: string; position?: GPSPosition; message?: string } | null {
  const frame = splitGpsaFrame(text)
  if (!frame) return null

  const callsign = frame.stationField.split('>')[0]
  if (!callsign) return null

  const position = parseGpsaBody(frame.data) ?? undefined
  // The same $$CRC-wrapped GPS-A framing radios use for position beacons is
  // also used to carry plain free-text messages — when the body isn't a
  // recognized position sentence *and* doesn't look like some other APRS
  // report type we just don't decode yet, surface it as a message instead
  // of silently dropping it.
  const trimmed = frame.data.trim()
  const message = !position && trimmed && !looksLikeAprsData(trimmed) ? trimmed : undefined
  return { callsign, position, message }
}

export function parseRawNmeaGps(
  text: string,
): { callsign: string; position?: GPSPosition; message?: string } | null {
  const trimmed = text.trim()

  const nmeaMatch = trimmed.match(/^((?:\$GP[^*]+\*[A-Fa-f0-9]{2}\r?\n?\s*)*)/)
  if (!nmeaMatch) return null

  const gpsBlock = nmeaMatch[1]!.trim()
  const stationField = trimmed.slice(nmeaMatch[1]!.length).trim()

  if (!stationField || stationField.length < 3) return null

  const parts = stationField.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const callsign = parts[0]!

  if (callsign.length < 3 || callsign.length > 20) return null

  let position: GPSPosition | undefined

  const ggaMatch = gpsBlock.match(/\$GPGGA[^*]+\*[A-Fa-f0-9]{2}/)
  if (ggaMatch) {
    position = parseNmea(ggaMatch[0]) ?? undefined
  }

  if (!position) {
    const rmcMatch = gpsBlock.match(/\$GPRMC[^*]+\*[A-Fa-f0-9]{2}/)
    if (rmcMatch) {
      position = parseNmea(rmcMatch[0]) ?? undefined
    }
  }

  return { callsign, position }
}

export function parseGps(text: string): GPSPosition | null {
  return parseNmea(text) ?? parseAprs(text) ?? parseAprsPosition(text)
}

export function distance(a: GPSPosition, b: GPSPosition): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

const GRID_FIELD = 'ABCDEFGHIJKLMNOPQR'
const GRID_SUBSQUARE = 'abcdefghijklmnopqrstuvwx'

// Maidenhead grid locator (QTH locator), standard 6-character precision
// (e.g. "JN45vb"): two-letter field (20°lon x 10°lat), two-digit square
// (2°lon x 1°lat), two-letter subsquare (5'lon x 2.5'lat).
export function toMaidenhead(lat: number, lon: number): string {
  const clampedLat = Math.min(89.9999, Math.max(-90, lat))
  const clampedLon = Math.min(179.9999, Math.max(-180, lon))

  let lonRem = clampedLon + 180
  let latRem = clampedLat + 90

  const lonField = Math.floor(lonRem / 20)
  const latField = Math.floor(latRem / 10)
  lonRem -= lonField * 20
  latRem -= latField * 10

  const lonSquare = Math.floor(lonRem / 2)
  const latSquare = Math.floor(latRem / 1)
  lonRem -= lonSquare * 2
  latRem -= latSquare * 1

  const lonSubsquare = Math.floor(lonRem * 12)
  const latSubsquare = Math.floor(latRem * 24)

  return (
    GRID_FIELD[lonField]! +
    GRID_FIELD[latField]! +
    String(lonSquare) +
    String(latSquare) +
    GRID_SUBSQUARE[lonSubsquare]! +
    GRID_SUBSQUARE[latSubsquare]!
  )
}

export function bearingTo(a: GPSPosition, b: GPSPosition): number {
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos((b.lat * Math.PI) / 180)
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
