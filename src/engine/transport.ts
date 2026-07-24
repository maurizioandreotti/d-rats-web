import { RadioSerial } from './serial'
import { ENCODED_HEADER, ENCODED_TRAILER, decodeFrame, encodeFrame } from './ddt2'
import type { DDT2Frame } from '../types'

export class Transport {
  private serial: RadioSerial
  private buffer = new Uint8Array(0)
  private onFrame: ((frame: DDT2Frame) => void) | null = null
  private onGpsString: ((text: string) => void) | null = null
  private onRawText: ((text: string) => void) | null = null

  constructor(serial: RadioSerial) {
    this.serial = serial
    this.serial.addDataCallback((data) => this.onSerialData(data))
  }

  setOnFrame(cb: (frame: DDT2Frame) => void): void {
    this.onFrame = cb
  }

  setOnGpsString(cb: (text: string) => void): void {
    this.onGpsString = cb
  }

  setOnRawText(cb: (text: string) => void): void {
    this.onRawText = cb
  }

  async sendFrame(frame: DDT2Frame, compress = true): Promise<void> {
    const wireData = await encodeFrame(frame, compress)
    await this.serial.send(wireData)
  }

  private onSerialData(data: Uint8Array): void {
    this.buffer = concat(this.buffer, data)
    this.parseFrames()

    const gpsText = this.matchGps()
    if (gpsText) {
      this.onGpsString?.(gpsText)
    }

    const rawText = this.matchRawText()
    if (rawText) {
      this.onRawText?.(rawText)
    }
  }

  private parseFrames(): void {
    while (true) {
      const sobIdx = findSequence(this.buffer, ENCODED_HEADER)
      if (sobIdx === -1) break

      const eobIdx = findSequence(
        this.buffer,
        ENCODED_TRAILER,
        sobIdx + ENCODED_HEADER.length,
      )
      if (eobIdx === -1) break

      const frameEnd = eobIdx + ENCODED_TRAILER.length
      const frameData = this.buffer.slice(sobIdx, frameEnd)

      const remaining = this.buffer.slice(frameEnd)
      this.buffer = new Uint8Array(remaining)

      decodeFrame(frameData).then((frame) => {
        if (frame) {
          this.onFrame?.(frame)
        } else {
          console.warn('[Transport] decodeFrame returned null — CRC, yEnc, or zlib mismatch')
        }
      })
    }
  }

  private matchGps(): string | null {
    const text = new TextDecoder().decode(this.buffer)

    const nmeaRegex = /((?:\$GP[^*]+\*[A-Fa-f0-9]{2}\r?\n?){1,2}.{8},.{20})/
    const nmeaMatch = text.match(nmeaRegex)
    if (nmeaMatch) {
      const gpsText = nmeaMatch[1]!
      this.buffer = new TextEncoder().encode(text.replace(gpsText, ''))
      return gpsText
    }

    const gpsaRegex = /(\$\$CRC[A-Za-z0-9]{4},[^\r]*\r)/
    const gpsaMatch = text.match(gpsaRegex)
    if (gpsaMatch) {
      const gpsText = gpsaMatch[1]!
      this.buffer = new TextEncoder().encode(text.replace(gpsText, ''))
      return gpsText
    }

    return null
  }

  private matchRawText(): string | null {
    const text = new TextDecoder().decode(this.buffer)
    const lineMatch = text.match(/^([^\r\n]{5,})\r?\n?/)
    if (!lineMatch) return null

    const rawText = lineMatch[1]!
    this.buffer = new TextEncoder().encode(text.replace(lineMatch[0], ''))
    return rawText
  }

  get hasBufferedData(): boolean {
    return this.buffer.length > 0
  }

  get bufferedLength(): number {
    return this.buffer.length
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result as Uint8Array<ArrayBuffer>
}

function findSequence(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  if (needle.length === 0) return start
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return i
  }
  return -1
}
