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
- `session-mgr.ts` — Session routing, heard station tracking, control-channel session negotiation (remote id mapping, teardown)
- `control.ts` — Control-channel (session 0) wire format: new-session request/ack, end-of-session
- `chat.ts` — Chat protocol (message, ping, status, GPS parsing)
- `file.ts` — File transfer engine: control-channel handshake, offer/accept over the data channel, windowed REQACK/ACK block transfer
- `rpc.ts` — RPC session (fixed session id 2, no control-channel negotiation): file-list/pull-file request-ack, GS/RS/US dict encoding; a successful pull kicks off a real `FileTransferEngine.sendFile()` as a side effect
- `ratflector.ts` — WebSocket bridge to ratflector (TCP proxy)
- `gps.ts` — NMEA/APRS/GPS-A parsing
- `crc.ts` — CRC-CCITT (0x1021) implementation
- `yencode.ts` — yEnc codec (banned bytes + escape handling)

### UI Layer (`src/components/`)
- `Layout.tsx` — Tab-based layout with station sidebar
- `ChatPanel.tsx` — Multi-port chat with channel badges; incoming messages have blue left border, outgoing have green left border
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

### Session Establishment & File Transfer
- Session ids are directional: outgoing frames for a negotiated session (file transfer) are addressed using the *peer's* chosen id, not your own — `session-mgr.ts`'s `outgoing()` rewrites `sessionId` from local to remote automatically. Chat (id 1) and control (id 0) are fixed/reserved and skip this rewrite.
- New session: requester sends a control-channel frame (type = 3 + session type, e.g. 8 for file transfer) with `[localId, name...]`; the peer auto-accepts, registers its own local id, and acks back `[requesterId, peerId]`. No user-facing accept/reject happens at this layer.
- File offer/accept travels over the *data* channel as ordinary blocks, not a distinct frame type: sender's first block is `[u32 LE size][filename]`; receiver replies with `"OK"` or `"RESUME:<offset>"` (resume is not implemented — always replies "OK" today) before the sender starts streaming real data.
- Data blocks use DDT2 header `type` 4 (DAT), 1 (ACK), 5 (REQACK); block numbers wrap mod 256. Sender pushes a window (capped at 4 blocks for the default 1024-byte blocksize, matching D-RATS's 4KB hard cap), requests ack via REQACK, and retries up to `FILE_MAX_RETRIES` times before giving up — a simplified but wire-compatible stand-in for D-RATS's adaptive-rate retry timing.
- Session teardown sends a control-channel end-of-session frame and waits for the peer's echo (bounded retries) before deregistering.
- `src/engine/file-transfer.test.ts` exercises the full handshake + windowed transfer + rejection path with two in-memory `SessionManager`/`FileTransferEngine` pairs wired directly together (no serial/radio needed).

### Ratflector Bridge
- `ratflector-bridge.py` — asyncio WebSocket-to-TCP proxy
- Connects to ratflector server (TCP) from browser via WebSocket
- WSL2 issue: localhost proxy breaks WebSocket upgrades — use WSL2 VM IP directly

### Station Name Handling
- `trimCallsign()` strips only tilde padding (0x7E) from 8-byte fields, matching the Python D-RATS decoder exactly — nulls/spaces are intentionally left untouched so a field that legitimately contains one isn't mangled
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

### Wiki (project-specific documentation)
- `docs/wiki/radio-setup.md` — Radio configuration for ICOM D-STAR models (ID-51, IC-2820, ID-5100, ID-880, etc.), ICF programming files, troubleshooting

### External References
- `https://github.com/sarahroselives/inmarscope` — D-STAR packet format reference

## Current Implementation Status
- ✅ Serial connection (one-way: app→radio confirmed)
- ✅ DDT2 frame encoding/decoding
- ✅ Multi-port architecture (serial + ratflector)
- ✅ Chat (broadcast, ping, status)
- ✅ Station monitoring with GPS
- ✅ Map with Leaflet
- ✅ Data sniffer for debugging
- ✅ Raw GPS data (APRS/GPS-A) parsed → stations + positions discovered
- ✅ Ping All broadcasts CQCQCQ on each connected port
- ✅ File transfer: control-channel session handshake, offer/accept, windowed REQACK/ACK block transfer, teardown (tested against itself via `file-transfer.test.ts`; not yet tested against a real radio or a real D-RATS Python peer)
- ✅ RPC file list/pull: browse a remote station's shared files and pull one by name, which triggers a real file transfer for the bytes (tested against itself via `rpc.test.ts`; not yet tested against a real D-RATS Python peer). Only `RPCFileListJob`/`RPCPullFileJob` are implemented — form list/pull, delete-file, position report, get-version, and check-mail RPC jobs are not
- ⏳ DDT2 frame receive from radio (needs testing with actual DDT2 data)
- ⏳ Ratflector connectivity (blocked by WSL2 WebSocket issue)
- ⏳ File transfer resume (`RESUME:<offset>`) — always replies "OK", no partial-download persistence
- ⏳ Shared-files list backing RPC file-list/pull is in-memory only — cleared on reload, unlike D-RATS's persisted folder

## Known Issues
- Radio receive: station names may not decode if padding is not tilde (0x7E) — matches Python's own limitation, not TS-specific
- WSL2 localhost proxy breaks WebSocket upgrades — use VM IP directly
- Multi-byte UTF-8 truncation risk in padCallsign (unlikely for amateur callsigns)
