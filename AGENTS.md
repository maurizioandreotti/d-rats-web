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
- `rpc.ts` — RPC session (fixed session id 2, no control-channel negotiation): file-list/pull-file/delete-file request-ack, GS/RS/US dict encoding; a successful pull kicks off a real `FileTransferEngine.sendFile()` as a side effect. Pull is gated by `allowRemoteFileTransfers` (config), delete by a configured password (`remoteDeletePassword`) — both matching D-RATS's `prefs.allow_remote_files`/`remote_admin_passwd`
- `local-files.ts` — File System Access API wrapper backing the "Local" file pane with a real picked folder (matches D-RATS's `download_dir`/"File Transfer Path"), plus IndexedDB persistence of the folder handle across reloads (a `FileSystemDirectoryHandle` can't go through config-store's localStorage-based persist)
- `callsign.ts` — Shared callsign-shape validator; rejects corrupted/garbled station names (e.g. from a checksum-mismatched frame) before they reach station tracking
- `ratflector.ts` — WebSocket bridge to ratflector (TCP proxy)
- `gps.ts` — NMEA/APRS/GPS-A parsing
- `crc.ts` — CRC-CCITT (0x1021) implementation
- `yencode.ts` — yEnc codec (banned bytes + escape handling)

### UI Layer (`src/components/`)
- `Layout.tsx` — Tab-based layout with station sidebar
- `ChatPanel.tsx` — Multi-port chat with channel badges; incoming messages have blue left border, outgoing have green left border
- `StationsList.tsx` — Heard stations with Ping All, Request Position/All
- `MapPanel.tsx` — Leaflet.js map with station markers
- `SnifferPanel.tsx` — Real-time hex/ASCII view of RX/TX data
- `ConfigPanel.tsx` — Multi-port configuration (serial/ratflector), file transfer settings
- `SerialConnect.tsx` — Port selection and connection UI
- `FileTransfer.tsx` — Transfers list + two-pane Local/Remote file explorer (station/port selector shared between both panes)
- `SharedFiles.tsx` — "Local" pane: real folder (via `local-files.ts`), Refresh/Delete/Upload toolbar — Upload pushes the selected file to the station selected in the Remote pane, matching D-RATS's `_upload` target logic
- `RemoteBrowser.tsx` — "Remote" pane: station picker restricted to already-heard stations + port selector + Connect/Disconnect/Download/Delete on one row, matching D-RATS's `main_files.py` `RemoteFileView`

### State (`src/store/`)
- `config-store.ts` — AppConfig with ports, callsign, preferences
- `station-store.ts` — Heard stations with GPS positions
- `chat-store.ts` — Chat message history
- `port-store.ts` — Port connection status
- `ratflector-store.ts` — Ratflector-specific state
- `ping-store.ts` — Ping request/response log (chat pings + position requests)
- `sniffer-store.ts` — Raw data capture for debugging
- `local-files-store.ts` — Local file pane state (picked folder, cached listing) backed by `local-files.ts`
- `rpc-store.ts` — Per-station remote file listing state (connect/disconnect/error) for the Remote pane

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
- File offer/accept travels over the *data* channel as ordinary blocks, not a distinct frame type: sender's first block is `[u32 LE size][filename]`; receiver replies with `"OK"` or `"RESUME:<offset>"` (resume is not implemented — always replies "OK" today) before the sender starts streaming real data. Matching the reference (`file.py`'s `recv_file()` has no accept/reject gate either), the receiver auto-acks every offer immediately — there's no manual Accept/Reject step, and a slow manual click was actually racing the sender's `FILE_OFFER_RESPONSE_TIMEOUT_MS` wait and causing stuck-at-0% transfers. `FileTransferEngine.cancelTransfer(sessionId)` (wired to a "Stop" button) is the only user-facing control, for either direction.
- Data blocks use DDT2 header `type` 4 (DAT), 1 (ACK), 5 (REQACK); block numbers wrap mod 256. Sender pushes a window (capped at 4 blocks for the default 1024-byte blocksize, matching D-RATS's 4KB hard cap), requests ack via REQACK, and retries up to `FILE_MAX_RETRIES` (10) times before giving up. Per-attempt wait grows as `FILE_MIN_TIMEOUT_MS * (attempt+1)` (4s, 8s, 12s...), approximating D-RATS's own `4 + attempts*4` schedule (`stateful.py`) — not the fully adaptive RTT/rate-based timeout D-RATS also has (floor 12s, scales with measured link speed), which isn't ported.
- Control-channel new-session retries also matter for real-link timing: `session-mgr.ts`'s `startSession()` retries 10 times at 5s then 15s (matches `control.py`'s `new_session()`) — the original 5×3s was fast enough to resend a `T_NEW` before a real peer's ack could arrive, which shows up on the peer's side as the same request appearing 2-3 times.
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
- ✅ File transfer: control-channel session handshake, auto-accepted offer (no manual gate, matching D-RATS), windowed REQACK/ACK block transfer, teardown, user-cancellable via a Stop button (tested against itself via `file-transfer.test.ts`; not yet tested against a real radio or a real D-RATS Python peer)
- ✅ RPC file list/pull/delete: two-pane Local/Remote file explorer matching D-RATS's `main_files.py` layout — Local pane lists a real picked folder (File System Access API, `local-files.ts`), Remote pane browses/pulls/deletes a heard station's shared files via RPC (tested against itself via `rpc.test.ts`; not yet tested against a real D-RATS Python peer). `RPCFileListJob`/`RPCPullFileJob`/`RPCDeleteFileJob` are implemented — form list/pull, position report, get-version, and check-mail RPC jobs are not. Not ported from D-RATS: the `delete_from` callsign allow-list (only the single shared password is enforced) and jpg/png `send_image()` preprocessing on upload
- ✅ Position requests: "Request Position"/"Request All Pos" and any incoming position request/response now show up in the Pings panel (session id 7, ad-hoc — not part of the control-channel handshake). No auto-reply yet: sending a request currently just logs it — replying with `config.myPosition` would need to be wired up
- ⏳ DDT2 frame receive from radio (needs testing with actual DDT2 data)
- ⏳ Ratflector connectivity (blocked by WSL2 WebSocket issue)
- ⏳ File transfer resume (`RESUME:<offset>`) — always replies "OK", no partial-download persistence
- ⏳ Shared-files list backing RPC file-list/pull is in-memory only — cleared on reload, unlike D-RATS's persisted folder

## Known Issues
- Radio receive: station names may not decode if padding is not tilde (0x7E) — matches Python's own limitation, not TS-specific
- WSL2 localhost proxy breaks WebSocket upgrades — use VM IP directly
- Multi-byte UTF-8 truncation risk in padCallsign (unlikely for amateur callsigns)
- The Local file pane's folder handle is remembered across reloads (IndexedDB), but Chromium requires a fresh user gesture ("Reconnect") to reconfirm permission after each reload — this is a browser security requirement, not something to work around
