import { describe, it, expect, vi } from 'vitest'
import { Transport } from './transport'
import { ENCODED_HEADER, ENCODED_TRAILER } from './ddt2'
import type { RadioSerial } from './serial'

// A fake RadioSerial that lets the test push raw bytes exactly as they'd
// arrive from a real USB-serial read loop — potentially split across
// multiple chunks mid-line, which is the scenario that was breaking raw
// text extraction.
function makeFakeSerial() {
  let handler: ((data: Uint8Array) => void) | null = null
  const fake = {
    addDataCallback: (cb: (data: Uint8Array) => void) => {
      handler = cb
    },
  } as unknown as RadioSerial

  return {
    fake,
    push: (chunk: string) => handler?.(new TextEncoder().encode(chunk)),
    pushBytes: (chunk: Uint8Array) => handler?.(chunk),
  }
}

describe('Transport raw text extraction', () => {
  it('waits for a line terminator instead of dispatching a partial chunk', () => {
    const { fake, push } = makeFakeSerial()
    const transport = new Transport(fake)
    const rawTexts: string[] = []
    transport.setOnRawText((text) => rawTexts.push(text))

    // Only the first half of the line has arrived — a USB-serial read loop
    // commonly delivers whatever bytes happen to be available per read.
    push('IQ2LC4>A')
    expect(rawTexts).toEqual([])

    // The rest of the line, including its terminator, arrives next.
    push('PI510,DSTAR*:prova\r')
    expect(rawTexts).toEqual(['IQ2LC4>API510,DSTAR*:prova'])
  })

  it('dispatches a complete line delivered in one chunk', () => {
    const { fake, push } = makeFakeSerial()
    const transport = new Transport(fake)
    const rawTexts: string[] = []
    transport.setOnRawText((text) => rawTexts.push(text))

    push('IQ2LC4>API510,DSTAR*:prova\r')
    expect(rawTexts).toEqual(['IQ2LC4>API510,DSTAR*:prova'])
  })

  it('does not mistake a still-assembling binary frame for text, even with an embedded CR', () => {
    const { fake, pushBytes } = makeFakeSerial()
    const transport = new Transport(fake)
    const rawTexts: string[] = []
    const gpsStrings: string[] = []
    transport.setOnRawText((text) => rawTexts.push(text))
    transport.setOnGpsString((text) => gpsStrings.push(text))
    transport.setOnFrame(vi.fn())

    // [SOB] plus some in-progress frame bytes — including a stray CR, which
    // is exactly what let matchRawText steal a chunk of a real DDT2 frame
    // and misreport a substring of its binary payload as a callsign.
    const partialFrame = new Uint8Array([
      ...ENCODED_HEADER,
      ...new TextEncoder().encode('IQ2LC4~~IZ2LXI~~x\r*binarygarbageKWp'),
    ])
    pushBytes(partialFrame)
    expect(rawTexts).toEqual([])
    expect(gpsStrings).toEqual([])

    // The rest of the frame, including its [EOB], arrives next.
    pushBytes(new Uint8Array([...new TextEncoder().encode('moretrailingbytes'), ...ENCODED_TRAILER]))
    expect(rawTexts).toEqual([])
    expect(gpsStrings).toEqual([])
  })
})
