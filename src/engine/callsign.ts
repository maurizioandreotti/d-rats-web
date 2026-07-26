// A minimal amateur-radio callsign shape check: 1-2 letters, a digit, 1-4
// letters/digits, optional "-SSID" or "/suffix" (portable, mobile, APRS
// SSID). Not a rigorous ITU validator — just enough to reject corrupted or
// garbled station names (e.g. from a checksum-mismatched frame that got
// decoded anyway) before they're ever shown as a "heard station".
const CALLSIGN_SHAPE = /^[A-Za-z]{1,2}\d[A-Za-z0-9]{1,4}([-/][A-Za-z0-9]{1,3})?$/

export function isValidCallsign(value: string): boolean {
  return CALLSIGN_SHAPE.test(value)
}
