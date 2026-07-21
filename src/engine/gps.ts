import type { GPSPosition } from '../types'

export function parseNmea(sentence: string): GPSPosition | null {
  // TODO: parse $GPGGA and $GPRMC sentences
  throw new Error('Not implemented')
}

export function parseAprs(data: string): GPSPosition | null {
  // TODO: parse GPS-A / APRS format ($$CRC...)
  throw new Error('Not implemented')
}

export function parseGps(text: string): GPSPosition | null {
  return parseNmea(text) ?? parseAprs(text)
}

export function distance(a: GPSPosition, b: GPSPosition): number {
  // Haversine formula
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
