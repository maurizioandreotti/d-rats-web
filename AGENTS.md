# D-RATS Web - Agent Instructions

## Project Goal
Port the D-RATS GTK desktop application to a browser-based PWA using React + TypeScript and Web Serial API. No backend server — runs entirely in the browser for emergency/deployed scenarios without internet.

## Repository
- **GitHub**: `github.com/maurizioandreotti/d-rats-web` (private)
- The original Python D-RATS codebase (`../d-rats/`) is used for **reference/inspiration only**
- **No file, no snippet, no comment** from the original codebase is to be committed to this repo
- All TypeScript implementation is a clean-sheet rewrite based on understanding of the protocol, not translation of the Python source

## Architecture

### Engine Layer (`src/engine/`)
- `serial.ts` — Web Serial API wrapper, XON/XOFF filtering, read loop
- `ddt2.ts` — DDT2 frame encode/decode (25-byte header, yEnc, zlib)
- `transport.ts` — Frame accumulation from serial, SOB/EOB parsing
- `transport-manager.ts` — Multi-port management, warmup frame logic
- `session-mgr.ts` — Session routing, heard station tracking
- `chat.ts` — Chat protocol (message, ping, status, GPS parsing)
- `file.ts` — File transfer engine (stateful ACK/NAK)
- `ratflector.ts` — WebSocket bridge to ratflector (TCP proxy)
- `gps.ts` — NMEA/APRS/GPS-A parsing
- `crc.ts` — CRC-CCITT (0x1021) implementation
- `yencode.ts` — yEnc codec (banned bytes + escape handling)

### UI Layer (`src/components/`)
- `Layout.tsx` — Tab-based layout with station sidebar
- `ChatPanel.tsx` — Multi-port chat with channel badges
- `StationsList.tsx` — Heard stations with Ping All
- `MapPanel.tsx` — Leaflet.js map with station markers
- `SnifferPanel.tsx` — Real-time hex/ASCII view of RX/TX data
- `ConfigPanel.tsx` — Multi-port configuration (serial/ratflector)
- `SerialConnect.tsx` — Port selection and connection UI

### State (`src/store/`)
- `config-store.ts` — AppConfig with ports, callsign, preferences
- `station-store.ts` — Heard stations with GPS positions
- `chat-store.ts` — Chat message history
- `port-store.ts` — Port connection status
- `ratflector-store.ts` — Ratflector-specific state
- `ping-store.ts` — Ping request/response log
- `sniffer-store.ts` — Raw data capture for debugging

### Types (`src/types/`)
- `index.ts` — All TypeScript interfaces and enums

## Commands
```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build (tsc + vite)
npm run test       # Run tests (vitest run)
npm run test:watch # Run tests in watch mode
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run format     # Prettier format
npm run format:check # Prettier check
npm run typecheck  # tsc --noEmit
```

## Key Implementation Details

### DDT2 Frame Format
```
[SOB] yencode(raw_frame) [EOB]
Raw frame: struct.pack("!BHBBHH8s8s", magic, seq, session, type, checksum, length, s_station, d_station) + data
- magic: 0xDD (compressed), 0x22 (uncompressed)
- session IDs: 0=control, 1=chat/broadcast, 2+=stateful
- s_station/d_station: 8 bytes, tilde-padded (0x7E)
```

### Serial Connection
- Web Serial API with XON/XOFF flow control
- DTR/RTS assertion required for ICOM radios
- Warmup frame sent after connect (type 254, session 0)
- Read loop filters XON/XOFF bytes, passes rest to transport

### Ratflector Bridge
- `ratflector-bridge.py` — asyncio WebSocket-to-TCP proxy
- Connects to ratflector server (TCP) from browser via WebSocket
- WSL2 issue: localhost proxy breaks WebSocket upgrades — use WSL2 VM IP directly

### Station Name Handling
- `trimCallsign()` strips tilde padding (0x7E) from 8-byte fields
- Null bytes (0x00) and spaces (0x20) NOT currently stripped — potential issue with non-D-RATS sources
- Callsigns stored as strings in station-store Record<string, Station>

### Protocol Reference (read-only, sibling directory)
The Python project lives at `../d-rats/` for reference only:
- `d_rats/comm.py` → serial communication concepts
- `d_rats/ddt2.py` → DDT2 frame structure
- `d_rats/transport.py` → frame parsing
- `d_rats/sessions/chat.py` → chat protocol
- `d_rats/sessions/file.py` → file transfer protocol
- `d_rats/gps.py` → NMEA/APRS/GPS-A parsing
- `d_rats/yencode.py` → yEnc codec
- `d_rats/crc_checksum.py` → 16-bit CRC

## Current Implementation Status
- ✅ Serial connection (one-way: app→radio confirmed)
- ✅ DDT2 frame encoding/decoding
- ✅ Multi-port architecture (serial + ratflector)
- ✅ Chat (broadcast, ping, status)
- ✅ Station monitoring with GPS
- ✅ Map with Leaflet
- ✅ Data sniffer for debugging
- ⏳ Radio→app receive path (needs testing with actual radio data)
- ⏳ Ratflector connectivity (blocked by WSL2 WebSocket issue)

## Known Issues
- Radio receive: station names may not decode if padding is not tilde (0x7E)
- WSL2 localhost proxy breaks WebSocket upgrades — use VM IP directly
- Null bytes in callsign fields cause equality check failures
- Multi-byte UTF-8 truncation risk in padCallsign (unlikely for amateur callsigns)
