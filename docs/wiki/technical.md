# Technical Aspects

## Callsign Suffixes (/P, /R, etc.)

The /P (portable) and similar suffixes you see on a D-STAR radio LCD come from **Own Callsign 2** in the D-STAR radio header (RF layer). This is a separate 4-byte field in the radio protocol, distinct from the 8-byte Own Callsign 1.

**Crucially, Own Callsign 2 is not transmitted over serial in the GPS data or DDT2 frames.** The serial data only carries Own Callsign 1. The 4-byte Own Callsign 2 from the radio header is stripped before the radio forwards data over the serial port.

This means:
- The radio LCD shows "IZ2LXI /P" because it decodes the full D-STAR radio header (Own Callsign 1 + Own Callsign 2)
- D-RATS Web only receives Own Callsign 1 ("IZ2LXI") over serial
- The `/P` suffix will NOT appear in the station list unless the transmitting D-RATS application includes it in the 8-byte DDT2 source station field (e.g. "IZ2LXI/P")

## ICOM GPS Data Format

ICOM D-STAR radios transmit GPS data in a proprietary format over serial:

1. Standard NMEA sentences ($GPGGA, $GPRMC, etc.) with position, altitude, speed, course
2. A 20-byte station identification field: `CALLSIGN , MODIFIER` (space-comma-space separated)

The NMEA sentences and station field arrive in separate serial chunks. D-RATS Web:
- Parses NMEA sentences for position data (lat, lon, alt)
- Parses the station field for the callsign
- Associates the position with the callsign

### Own Callsign 2

Per the JARL D-STAR standard (shogen.pdf §2.2.1):
> "Own Callsign 2" contains information to display after a "/ (slash)". The "/" is not stored in the field — it is inserted by the display software.

Example: Own Callsign 1 = "IZ2LXI", Own Callsign 2 = "P" → displayed as "IZ2LXI /P"

### Station ID Field Structure

```
CALLSIGN1 , CALLSIGN2[spaces]
```

- CALLSIGN1: variable-length callsign (from Own Callsign 1, up to 8 bytes)
- " , ": separator (space, comma, space)
- CALLSIGN2: modifier suffix (from Own Callsign 2), often empty
- Padded with spaces to 20 bytes total, terminated by \r\n
