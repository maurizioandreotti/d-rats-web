# Radio Setup for D-RATS

## ICOM D-STAR Radios

### General Notes
- **Baud rate**: 9600 for most ICOM radios, 38400 for IC-91/92AD
- **USB dongle**: Requires DTR/RTS assertion to power the RS-232 level converter. The app asserts DTR+RTS on connect.
- **Data mode**: Radio must be configured for DV Data TX = AUTO — this is the key setting that enables the radio to send/receive D-STAR packet data through the serial port.
- **GPS**: For receiving GPS positions from other stations, no special config needed. For transmitting your own position, see specific radio models below.

### ICOM ID-51A / ID-51E / ID-51A+
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| DV Data TX | AUTO |
| GPS TX Mode | OFF (unless you want to transmit GPS) |
| GPS Auto TX | OFF |
| GPS Out | OFF |

**For D-RATS ping/GPS queries to work**, the radio does not need to reply automatically. The radio simply passes DDT2 frames through the serial port — D-RATS handles the application-level protocol (ping responses, GPS position queries via RPC).

**For automatic GPS position transmission** (so other stations see your position):
1. Enable GPS: `Menu → GPS → Set → GPS → On`
2. Wait for GPS fix (icon stops blinking)
3. Set GPS TX mode to **DV-G** (GPS mode)
   - On newer ID-51 variants: **GPS (DV-G)** = position over voice, **GPS-A (DV-A)** = D-PRS format
4. Enable auto-transmission interval: `Menu → GPS → Auto TX → 1min / 2min / 5min / 10min`
5. Set your callsign in the radio if not already set

The radio will periodically transmit `$$CRC...` format APRS position reports which the app parses via `parseIcomGps()`.

### ICOM ID-31A
Same family as ID-51. Settings mirrored.

### ICOM IC-2820H
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| DV Data TX | AUTO |
| GPS TX | DISABLED |
| GPS Auto TX | OFF |
| Note | UT-123 D-STAR module must be installed |

### ICOM ID-5100
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| DV Data TX | AUTO |
| GPS TX | DISABLED |
| GPS Auto TX | OFF |

- ICF programming files for the CS-5100 software are in `support-material/`
- The programming cable is the same OPC-478UC or similar USB data cable

### ICOM ID-880H
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| Data TX | AUTO |
| GPS-TX | OFF |
| GPS Auto TX | OFF |

### ICOM IC-80AD
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| Data TX | AUTO |
| GPS-TX | OFF |
| GPS Auto TX | OFF |

### ICOM ID-800H
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| Data TX (DVT) | DVTAT (Auto) |
| Speed (SPD) | SPD96 |

### ICOM IC-91AD / IC-92AD
| Setting | Value |
|---------|-------|
| Baud rate | **38400** |
| DV Data TX | AUTO |
| GPS TX | DISABLED |
| GPS Auto TX | OFF |

### ICOM ID-1
| Setting | Value |
|---------|-------|
| Baud rate | **19200** |
| DV Data TX | AUTO |

Note: Cannot use PC application simultaneously with D-RATS on ID-1.

### ICOM IC-V82 / IC-U82
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| ATX | ATXON |
| SPD | SPD96 |

### ICOM IC-2200
| Setting | Value |
|---------|-------|
| Baud rate | 9600 |
| ATX | ATXON |
| SPD | SPD96 |

## Kenwood Radios
No Kenwood-specific radio settings documented yet. Kenwood TM-D710/TM-D700 radios use a different serial protocol (GPS data through dedicated NMEA port). D-RATS support for Kenwood direct connection is not implemented in this web app. Use ratflector for cross-brand connectivity.

## Ratflector (Cross-Brand Gateway)
Instead of direct serial radio connection, D-RATS can operate through a **ratflector** — a TCP server that relays DDT2 frames between users. This works with any D-STAR radio through any gateway:
- Connect your D-STAR radio to a DVAP, DV-Mega, or homebrew hotspot running DVRPTR / OpenSpot
- Configure the hotspot to route to a ratflector server
- The ratflector supports both direct TCP (for the original Python D-RATS) and WebSocket bridge (for this web app)

## ICF Programming Files
The `support-material/` directory contains ICF (Icom CSV Format) files for CS-51 / CS-5100 programming software:

| File | Purpose |
|------|---------|
| `ID51 IZ2LXI DRATS.icf` | ID-51 with D-RATS memory channels, IZ2LXI |
| `ID51 Arilecco - AutoTX.icf` | ID-51 with Auto TX for Sezione ARI Lecco |
| `ID51_giirdimont2024.icf` | ID-51 for Giirdimont 2024 event |
| `ID51-IZ2LXI- AutoTX.icf` | ID-51, IZ2LXI, with GPS Auto TX enabled |
| `2820 IZ2LXI.icf` | IC-2820, IZ2LXI |
| `2820 SezioneAriLecco.icf` | IC-2820 for Sezione ARI Lecco |
| `5100-IZ2LXI.icf` | ID-5100, IZ2LXI |

These can be loaded into the CS-51/CS-5100 software and written to the radio via the programming cable.

## Troubleshooting

### No data from radio
1. Check DTR/RTS: the app logs `[RadioSerial] setSignals(DTR=1, RTS=1) OK` in console. If it fails, the USB dongle may not need DTR — connect should still work.
2. Verify DV Data TX = AUTO in radio menu
3. Power-cycle the radio after connecting USB — some ICOM radios need a cold start to enable the data port
4. Check the sniffer panel for RX packets. If only XOFF (0x13) and XON (0x11) bytes appear, the radio serial link is alive but no data frames are arriving.

### GPS positions not appearing
1. The transmitting station must have GPS enabled and GPS TX set to DV-G
2. GPS-A (DV-A) format is D-PRS — not currently parsed by the app
3. Raw `$$CRC` frames will appear in the sniffer as RX packets if they arrive

### Ping not getting response
1. The target station must be running D-RATS (or this web app) on their radio
2. D-RATS ping is an application-level protocol over DDT2 frames, not a radio feature
3. Verify the target radio is configured with DV Data TX = AUTO to pass DDT2 frames
