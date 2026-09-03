# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `0.1.x` (main) | Yes — active development |

## Reporting a Vulnerability

**Do not open a public issue** for security reports.

* Email the maintainer via the GitHub profile at `github.com/maurizioandreotti` (private repo) or open a *private* security advisory if the repo enables it.
* Include: affected version/commit, steps to reproduce, impact, and whether the flaw requires a radio or is browser-only.
* Expect an acknowledgment within 72 hours and a fix or mitigation plan within 14 days for high-severity issues.

We follow coordinated disclosure: please allow us time to ship a fix before public disclosure.

## Scope & Threat Model

D-RATS Web is a **pure client-side PWA** with no backend:

* All state (callsign, files, chat history) lives in the user's browser (`localStorage` for `drats-config`/`drats-chat`/`drats-stations` at `src/store/config-store.ts:14`, `IndexedDB` for the shared folder handle at `src/engine/local-files.ts:10`).
* The only network egress is (a) OSM tile fetches cached 30 days (`vite.config.ts:30`) and (b) the optional WebSocket-to-TCP ratflector bridge (`ratflector-bridge.py:1`). No telemetry is sent by the app.
* File sharing is explicit: the `File System Access` picker (`src/engine/local-files.ts:53`) never uploads without a user gesture; remote pull/delete are gated by `allowRemoteFileTransfers` / `remoteDeletePassword` (`src/engine/rpc.ts:140`, `src/store/config-store.ts:14`).

### What We Treat as Security-Relevant

* XSS via crafted frames or RPC `info` strings rendered as HTML/markdown (we render file names as text only; wiki markdown is `react-markdown` with `remark-gfm` — no raw HTML).
* Path traversal or escape from the picked folder (File System Access is sandboxed to the handle; `encodeDict` separators `US/RS/GS` are not used in file I/O).
* Credential exposure for ratflector (`RatflectorConfig.password` lives in `localStorage` `drats-config` — treat it as the user treats their D-RATS password; not synced anywhere).
* Denial-of-service via crafted DDT2 frames (CRC/yEnc/zlib mismatches are dropped to `useEventStore` via `setOnDecodeError` at `src/engine/transport.ts:27` and `src/engine/ratflector.ts:28`).

### Out of Scope

* Physical RF security (D-STAR is open; encryption on ham bands is prohibited).
* Browser or OS vulnerabilities, or compromise of the user's `dist/` host (deploy over HTTPS; see `docs/deployment.md`).

## Secure Deployment

* Always host `dist/` over **HTTPS** (except `http://localhost` for local install). Service workers and Web Serial/File System Access require a secure context (`README.md:30`).
* Keep `ratflector-bridge.py` bound to `127.0.0.1` or a trusted LAN interface, not `0.0.0.0` unless you intend to expose it; the bridge has no auth of its own.

## Dependencies

Run `npm audit` and keep `leaflet`, `react`, `zustand`, and Vite deps current. Pinned versions are in `package-lock.json`.
