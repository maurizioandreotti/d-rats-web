# D-RATS Web App - Agent Instructions

## Project Goal
Port the D-RATS GTK desktop application to a browser-based PWA using React + TypeScript and Web Serial API. No backend server — runs entirely in the browser for emergency/deployed scenarios without internet.

## Repository
- **GitHub**: `github.com/maurizioandreotti/d-rats-web` (private)
- The original Python D-RATS codebase (`ham-radio-software/D-Rats`) is used for **reference/inspiration only**
- **No file, no snippet, no comment** from the original codebase is to be committed to this repo
- All TypeScript implementation is a clean-sheet rewrite based on understanding of the protocol, not translation of the Python source
- First commit should set up the project scaffold only

## Architecture
- **Engine Layer** (TypeScript): D-RATS protocol stack — serial, DDT2 framing, session management, chat, file transfer, GPS parsing
- **Web APIs**: Web Serial (radio), CompressionStream (zlib), IndexedDB (storage), Cache API (offline tiles), Service Worker (PWA)
- **UI Layer**: React + TypeScript with Zustand state management, Leaflet.js maps
- **Single-user**: one radio, one browser session

## Priority Order
1. Serial connection to ICOM radio via USB dongle (Web Serial API + XON/XOFF flow control)
2. Station monitoring + map (parse GPS from chat, show positions on Leaflet map)
3. Chat (broadcast via DDT2 stateless session)
4. File transfer (stateful ACK/NAK protocol, IndexedDB storage)

## Key Conventions
- TypeScript with strict mode. No `any` except where unavoidable
- Zustand for state, not Redux
- Leaflet (not MapLibre/Mapbox) for maps
- Vite for build tooling
- vitest for testing
- PWA via vite-plugin-pwa
- All protocol constants and frame formats documented inline with references to the published D-STAR / D-RATS protocol documentation (not the Python source)

## Commands
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run test       # Run tests
npm run lint       # ESLint + Prettier
npm run typecheck  # tsc --noEmit
```

## Protocol Reference (read-only, sibling directory)
The Python project lives at `../d-rats/` for reference only:
- `d_rats/comm.py` → serial communication + flow control concepts
- `d_rats/ddt2.py` → DDT2 frame structure (25-byte header, zlib, yEnc)
- `d_rats/transport.py` → frame parsing (SOB/EOB markers)
- `d_rats/sessions/chat.py` → chat protocol
- `d_rats/sessions/file.py` → file transfer protocol
- `d_rats/gps.py` → NMEA/APRS/GPS-A parsing
- `d_rats/yencode.py` → yEnc codec
- `d_rats/crc_checksum.py` → 16-bit CRC

## DDT2 Frame Format (reference)
```
[SOB] yencode(raw_frame) [EOB]
Raw frame: struct.pack("!BHBBHH8s8s", magic, seq, session, type, checksum, length, s_station, d_station) + data
- magic: 0xDD (zlib compressed), 0x22 (uncompressed)
- session IDs: 0=control, 1=chat/broadcast, 2+ = stateful sessions
```

## File Transfer Protocol (reference)
- Block size: 1024 bytes, window: 8 blocks (adaptive)
- ACK/NAK with retry (max 10), adaptive timeout
- Resume support via .part files and RESUME:<offset>
- zlib level 9 compression
