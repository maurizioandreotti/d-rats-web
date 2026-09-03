# Development Guide

## Prerequisites

* **Node** 18+ (tested on 20), **npm** 9+
* **Browser**: Chrome or Edge 89+ for Web Serial / File System Access (`src/engine/serial.ts:51` `getSerialApi()` feature check, `src/engine/local-files.ts:50` `isSupported()`)
* **Radio** (optional for UI work): ICOM D-STAR with USB data cable (see `docs/wiki/radio-setup.md`); otherwise all protocol tests run in-memory
* **Python 3.10+** only if you run `ratflector-bridge.py:1` or `wstest-server.py`

## Setup

```bash
git clone https://github.com/maurizioandreotti/d-rats-web.git
cd d-rats-web
npm install
npm run dev        # http://localhost:5173 with HMR
```

The Python reference at `../d-rats/` is not required to build; it is read-only for protocol semantics (`AGENTS.md:105`).

## Scripts (`package.json:7`)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b && vite build` → `dist/` (service worker only in prod) |
| `npm run preview` | Serve `dist/` on `http://localhost:4173` |
| `npm run typecheck` | `tsc -b` (no emit) |
| `npm run test` | `vitest run` once |
| `npm run test:watch` | `vitest` watch mode |
| `npm run lint` / `lint:fix` | ESLint (note: flat config `eslint.config.js` required; see warning) |
| `npm run format` / `format:check` | Prettier `src/**/*.{ts,tsx,css}` |

## Project Structure

Described fully in [`architecture.md`](./architecture.md#2-repository-layout). Key directories:

* `src/engine/` — protocol & I/O (no React imports)
* `src/store/` — Zustand stores (`config`, `station`, `chat`, `port`, `file`, `rpc`, `local-files`, `ping`, `sniffer`, `event`, `ratflector`, `auth`)
* `src/hooks/useDratsEngine.ts:23` — wiring hook instantiated once in `Layout.tsx:1`
* `src/components/` — tabs: Chat, Stations, Map, Files, Config, Sniffer, etc.
* `src/types/index.ts:1` — shared interfaces (`Station`, `DDT2Frame`, `AppConfig`, …)

## Configuration & State Persistence

* `useConfigStore` (`src/store/config-store.ts:14`) persists as `drats-config` v3 in `localStorage`. `migrate` resets on version bump — coordinate with reviewers before bumping.
* `useStationStore` / `useChatStore` similarly persist; ephemeral stores (`port`, `file`, `rpc`, `ping`, `sniffer`, `event`) are memory-only for performance/correctness.
* The shared folder handle cannot go through `localStorage`; it is stored in `IndexedDB` (`drats-web` DB, `handles` store, key `sharedFolder` at `src/engine/local-files.ts:6`). Chromium still requires a user gesture to re-grant after reload (`permission: 'needs-permission'` at `src/store/local-files-store.ts:13`).

## Coding Conventions

* TypeScript strict, `Uint8Array` throughout serial/codec paths (no `Buffer`).
* File:line citations when touching wire code (e.g. `ddt2.ts:72` `encodeFrame`).
* Keep `src/engine/` free of React/store imports except the legacy `authenticated-transport.ts:1`.
* State updates: prefer `getState()` reads on hot I/O paths over subscribing React hooks.

## Working with Hardware

* **Serial** (`src/engine/serial.ts:115`): `connect` closes stale streams, `open` with `flowControl:'none'`, asserts DTR/RTS, starts `startReadLoop :251` with XON/XOFF filtering. Use the **Sniffer** tab (`src/components/SnifferPanel.tsx:1`) to see raw RX/TX.
* **Warmup frame** (`src/engine/transport-manager.ts:146`): `type 254, session 0, magic 0x22, 16×0x01` — sent on every serial connect.
* **WSL2** quirk: `localhost` WebSocket proxy breaks upgrade; use `ws://<VM-IP>:9001` (`src/engine/ratflector.ts:40`).

## Environment

No `.env` is required. The only runtime URLs are:

* Ratflector `bridgeUrl` (default `ws://localhost:9001` at `src/engine/ratflector.ts:40`, configurable per port in `ConfigPanel.tsx:1`)
* OSM tiles `https://tile.openstreetmap.org` (cached via `vite.config.ts:32`)

## Troubleshooting Dev

* `navigator.serial is undefined` → not Chrome/Edge, or insecure context (`file://`). Use `localhost` or HTTPS.
* Vite `eslint.config` error — the repo uses legacy `.eslintrc` shape; add an `eslint.config.js` flat config or run `npx oxlint` (`package.json:45`).
* `showDirectoryPicker is not a function` → non-Chromium browser or insecure context.
* `IndexedDB` handle loses permission after reload — click **Reconnect** in the Files tab (`src/components/SharedFiles.tsx:1`).

See also [`docs/wiki/troubleshooting.md`](./wiki/troubleshooting.md) and [`../AGENTS.md`](../AGENTS.md#known-issues).
