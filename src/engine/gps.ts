import type { GPSPosition } from '../types'

export function parseNmea(sentence: string): GPSPosition | null {
  const trimmed = sentence.trim()

  let lat = 0
  let lon = 0
  let alt: number | undefined
  let speed: number | undefined
  let direction: number | undefined

  const parts = trimmed.split('*')
  const body = parts[0]

  if (!body) return null

  const fields = body.split(',')

  if (body.startsWith('$GPGGA')) {
    if (fields.length < 10) return null
    const latRaw = fields[2]
    const latDir = fields[3]
    const lonRaw = fields[4]
    const lonDir = fields[5]
    const altRaw = fields[9]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    lat = parseCoord(latRaw, latDir)
    lon = parseCoord(lonRaw, lonDir)

    if (altRaw) {
      alt = parseFloat(altRaw)
    }

    return { lat, lon, alt, timestamp: Date.now() }
  }

  if (body.startsWith('$GPRMC')) {
    if (fields.length < 10) return null
    const latRaw = fields[3]
    const latDir = fields[4]
    const lonRaw = fields[5]
    const lonDir = fields[6]
    const speedRaw = fields[7]
    const courseRaw = fields[8]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    lat = parseCoord(latRaw, latDir)
    lon = parseCoord(lonRaw, lonDir)

    if (speedRaw) {
      speed = parseFloat(speedRaw) * 1.852
    }

    if (courseRaw) {
      direction = parseFloat(courseRaw)
    }

    return { lat, lon, speed, direction, timestamp: Date.now() }
  }

  if (body.startsWith('$GPGLL')) {
    if (fields.length < 7) return null
    const latRaw = fields[1]
    const latDir = fields[2]
    const lonRaw = fields[3]
    const lonDir = fields[4]

    if (!latRaw || !latDir || !lonRaw || !lonDir) return null

    lat = parseCoord(latRaw, latDir)
    lon = parseCoord(lonRaw, lonDir)

    return { lat, lon, timestamp: Date.now() }
  }

  return null
}

export function parseAprs(data: string): GPSPosition | null {
  const trimmed = data.trim()

  const gpsaMatch = trimmed.match(/^\$\$CRC[A-Za-z0-9]{4},(.*)\r?$/)
  if (!gpsaMatch) return null

  const body = gpsaMatch[1]
  if (!body) return null

  const fields = body.split(',')
  if (fields.length < 4) return null

  const latRaw = fields[0]
  const lonRaw = fields[1]

  if (!latRaw || !lonRaw) return null

  const lat = parseDms(latRaw)
  const lon = parseDms(lonRaw)

  if (isNaN(lat) || isNaN(lon)) return null

  const result: GPSPosition = { lat, lon, timestamp: Date.now() }

  if (fields[2]) {
    const altRaw = fields[2]
    if (altRaw.startsWith('A=')) {
      result.alt = parseFloat(altRaw.slice(2))
    } else {
      result.alt = parseFloat(altRaw)
    }
  }

  if (fields[3]) {
    const courseSpeed = fields[3]
    const csMatch = courseSpeed.match(/(\d+)\/(\d+)/)
    if (csMatch) {
      result.direction = parseFloat(csMatch[1]!)
      result.speed = parseFloat(csMatch[2]!) * 1.852
    }
  }

  return result
}

export function parseGps(text: string): GPSPosition | null {
  return parseNmea(text) ?? parseAprs(text)
}

function parseCoord(raw: string, dir: string): number {
  const dot = raw.indexOf('.')
  if (dot === -1) return parseFloat(raw)

  const degrees = parseInt(raw.substring(0, dot - 2), 10)
  const minutes = parseFloat(raw.substring(dot - 2))

  let value = Math.abs(degrees) + minutes / 60
  if (dir === 'S' || dir === 'W') {
    value = -value
  }

  return value
}

function parseDms(raw: string): number {
  const trimmed = raw.trim()

  const dmsMatch = trimmed.match(/^(\d{2,3})(\d{2}\.\d+)$/)
  if (dmsMatch) {
    const degrees = parseInt(dmsMatch[1]!, 10)
    const minutes = parseFloat(dmsMatch[2]!)
    return degrees + minutes / 60
  }

  const decMatch = trimmed.match(/^(-?\d+\.\d+)$/)
  if (decMatch) {
    return parseFloat(decMatch[1]!)
  }

  return NaN
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
