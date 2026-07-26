import { describe, it, expect } from 'vitest'
import { parseIcomGps } from './gps'

describe('parseIcomGps', () => {
  it('extracts a position and no message from a valid position report', () => {
    const result = parseIcomGps('$$CRC1234,IZ2LXI>APRS,DSTAR*:!4530.00N/00930.00E-hello')
    expect(result?.callsign).toBe('IZ2LXI')
    expect(result?.position).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) })
    expect(result?.message).toBeUndefined()
  })

  it('surfaces plain free text as a message instead of dropping it', () => {
    const result = parseIcomGps('$$CRC1234,IZ2LXI>API510,DSTAR*:Hello from the shack')
    expect(result?.callsign).toBe('IZ2LXI')
    expect(result?.position).toBeUndefined()
    expect(result?.message).toBe('Hello from the shack')
  })

  it('does not misclassify an unsupported APRS object report as a chat message', () => {
    const result = parseIcomGps(
      '$$CRCA30A,IU2IHL>API510,DSTAR*:; *250804z0000.00N/00000.00E-PHG0000/',
    )
    expect(result?.callsign).toBe('IU2IHL')
    expect(result?.position).toBeUndefined()
    expect(result?.message).toBeUndefined()
  })

  it('rejects a station field that does not look like a real callsign', () => {
    // A malformed/truncated frame (e.g. from a corrupted capture) could put
    // stray non-callsign text before the '>' — this must never surface as a
    // "heard station".
    const result = parseIcomGps('$$CRC1234,!>API510,DSTAR*:!4530.00N/00930.00E-hello')
    expect(result).toBeNull()
  })
})
