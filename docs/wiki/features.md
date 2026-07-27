# Features

## What's Not Working

- **File transfer over a real RF link** — pulling a file from a real D-RATS station has been confirmed working end-to-end. Pushing (uploading) a file to a real D-RATS station has not: in testing, the session negotiation succeeds but the offer/ack exchange afterward gets no response at all. Suspected cause is channel contention on a shared half-duplex RF link (no collision avoidance in the protocol), not yet confirmed — see [Troubleshooting](troubleshooting.md).
- **Ratflector connections** — blocked under WSL2 by a localhost-proxy/WebSocket upgrade issue; not yet workable from a WSL2 dev environment.
- **Email & Winlink** — D-RATS's email-over-Winlink-gateway feature is not implemented in this port at all.

## Introduction

What's implemented in D-RATS Web today, organized by tab.

## Chat

- Multi-port chat: broadcast (`CQCQCQ`) or directed to a specific callsign, picking which connected port a message goes out on
- Ping / Ping All and echo request/response, logged in the [Pings](#pings--position-requests) panel
- Sign-on/sign-off status broadcasts (configurable in [Config](#config))
- Incoming messages get a blue left border, outgoing green, so a busy channel stays readable
- Free-text messages carried inside a radio's GPS-A wrapper (the same `$$CRC...` framing used for position beacons) are recognized as chat, not just logged as unparsed GPS traffic — see [Technical Aspects](technical.md) for the wrapper format

## Stations

- Heard-stations list, populated automatically from the source callsign of any successfully decoded frame (chat, GPS, ping, file transfer, RPC — anything)
- GPS position tracking from NMEA and APRS/GPS-A sentences
- Right-click a station for: Ping, Request Position, Show on Map (if it has a position), Lookup on QRZ, Remove from list
- "Ping All" and "Request All Pos" broadcast `CQCQCQ` on every connected port

## Pings & Position Requests

The Pings tab shows both:
- Regular chat pings (request/response/echo)
- Position requests — "Request Position"/"Request All Pos" (sent), and any `position?` request or position-bearing reply heard on the wire (received), logged as `position_request`/`position_response`

Position requests use a fixed, ad-hoc session slot (not negotiated over the control channel) — same convention D-RATS uses. There's currently no auto-reply when *you're* asked for your position; a request is logged but not answered automatically.

## Map

- Leaflet map showing your own position (draggable marker) and every heard station with a known position
- 📍 button to use the browser's geolocation API for your own position
- Remembers the last pan/zoom position across visits to the tab

## File Transfer

The Files tab is a two-pane explorer, matching D-RATS's own layout:

### Local (left)

- Backed by a real folder on disk, picked once via **Choose Folder…** (File System Access API — Chromium-only, same requirement as Web Serial). This is the folder listed here *and* served to other stations' RPC file-list/pull requests — D-RATS's `download_dir` / "File Transfer Path" equivalent.
- **Refresh** re-scans the folder. **Delete** removes selected file(s) from it. **Upload** pushes the single selected file to whichever station is currently selected in the Remote pane — this is a direct push (`FileTransferSession`), not related to RPC.
- A small "+ Add file to folder" link writes a picked file into the folder from within the browser, since a web page can't otherwise drop files into it the way a desktop file manager can.
- The folder handle is remembered across reloads (IndexedDB), but Chromium requires a fresh click to reconfirm permission each time you reload — a browser security requirement, not a bug.

### Remote (right)

- **Station** dropdown is restricted to already-heard stations — you can't browse a station you haven't heard from.
- **Connect** lists that station's shared files via RPC; once connected it becomes **Refresh** to re-fetch the same listing without disconnecting first.
- **Download** pulls the selected remote file (RPC pull → triggers a real file transfer back to you, which shows up in the Transfers list above once it arrives).
- **Delete** removes a file from the *remote* station, gated by a password you're prompted for — only works if that station has a delete password configured (see [Config](#config)).
- The station/port selection and current listing persist across tab switches (they live in a store, not component state).

### Wire protocol notes

- File content is compressed **once, as a whole file**, before being sliced into transport blocks — matching D-RATS exactly (`zlib.compress()` over the whole file up front; the receiver concatenates every block first and inflates once at the end). This is *not* the same as the generic per-frame DDT2 compression flag.
- Every incoming file offer is auto-accepted immediately — D-RATS has no manual accept/reject gate at all, and waiting on a human click was actually racing the sender's own timeout.
- Any transfer in progress can be cancelled with the **Abort** button, which takes effect immediately rather than waiting out whatever retry/timeout is currently in flight.
- Remote file listing/pull/delete is `RPCFileListJob`/`RPCPullFileJob`/`RPCDeleteFileJob` over a fixed RPC session slot (no control-channel negotiation needed). Pulls are gated by the "Remote file transfers" checkbox; deletes by the configured password.

## Config

- **Station**: callsign, name, sign-on/off messages, ping reply text, auto-connect at launch
- **Map**: your position (lat/lon, or pick it on an inline map), default zoom
- **File Transfer**: shared folder picker, "Remote file transfers" toggle (gates other stations pulling from you), remote delete password (blank disables remote delete entirely)
- **Apply** button gives a "✓ Saved" confirmation — every field actually saves instantly as you type; this just confirms it, it isn't a separate commit step
- Export/Import config as JSON, or reset to defaults

## Sniffer

Real-time hex/ASCII view of raw RX/TX bytes on a connected port, for debugging what's actually on the wire below the frame-decoding layer.

## Event Log

Unified, timestamped log across every subsystem: decoded frames (both directions, with session/type/seq), chat, RPC calls, file transfer state changes, GPS parses, pings, and decode failures (CRC/yEnc/zlib mismatches, dropped frames for an unknown session) that would otherwise be invisible. Exportable to a text file.

## Known limitations

- File System Access API features (Local file pane, folder picker) require a Chromium-based browser
- No auto-reply to position requests yet — answering one would need your own position wired up as a responder
- No collision avoidance on shared half-duplex RF links — two stations retrying at once can step on each other, which looks like "no response at all" rather than a protocol error
- Ratflector (TCP bridge) connectivity is blocked under WSL2 by a localhost-proxy/WebSocket issue — see [Troubleshooting](troubleshooting.md)
