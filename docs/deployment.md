# Deployment Guide

D-RATS Web has **no backend** — deployment is a static `dist/` folder.

## Build

```bash
npm install
npm run build        # tsc -b && vite build → dist/
```

Verify locally first:

```bash
npm run preview      # serves dist/ at http://localhost:4173
# or
npx serve dist
# or
python3 -m http.server --directory dist 8000
```

Only the production build registers the service worker (`vite.config.ts:8` `VitePWA` with `registerType: autoUpdate`). `npm run dev` does **not** produce an installable PWA.

## PWA Install (Offline-First)

The installed app runs entirely from the service-worker cache — no server or internet needed afterward except for fresh OSM tiles (already-viewed tiles are cached 30 days at `vite.config.ts:32`).

1. Build: `npm run build`.
2. Serve `dist/` on **`http://localhost`** (any static server) — `file://` is not a secure context and Web Serial / File System Access / service workers will be disabled (`README.md:30`).
3. Open the printed `http://localhost:…` URL in **Chrome or Edge** (Web Serial + File System Access are Chromium-only).
4. Click the **Install** icon in the address bar (or menu → Install D-RATS Web). This creates a standalone window with its own shortcut.
5. Stop the server — the installed copy keeps working from cache.

Incognito/InPrivate disables the install prompt — use a regular window.

## Public Hosting

Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages):

* Host the **contents of `dist/`**.
* Must be served over **HTTPS** (only `http://localhost` is exempt; public `http://` fails the secure-context check).
* `registerType: autoUpdate` already does background update next time the user is online — no reinstall needed.
* No secrets are exposed: config/callsign/file handles stay in the user's browser (`localStorage` `drats-config` at `src/store/config-store.ts:14`, `IndexedDB` `drats-web/handles` at `src/engine/local-files.ts:6`).

### GitHub Pages Example

```yaml
# .github/workflows/deploy.yml
name: deploy
on: { push: { branches: [main] } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with: { github_token: ${{ secrets.GITHUB_TOKEN }}, publish_dir: ./dist }
```

### Cloudflare / Netlify / Vercel

Set build command `npm run build`, output directory `dist`, Node 20. No env vars, no functions.

## Ratflector Bridge Deployment

Browsers cannot open raw TCP to ratflectors — the Python asyncio bridge proxies WS→TCP (`ratflector-bridge.py:1`):

```bash
python3 ratflector-bridge.py --host 0.0.0.0 --port 9001
# D-RATS Web: bridgeUrl default ws://localhost:9001 at src/engine/ratflector.ts:40
```

* Keep it on `127.0.0.1` unless you intentionally expose it — it has no auth of its own (ratflector auth is proxied).
* WSL2: do **not** use `ws://localhost:9001` from Windows Chrome — use `ws://<WSL-VM-IP>:9001` (`AGENTS.md:99`).
* The bridge handles WS framing (`WebSocketFrame.encode/read_frame :33`), the `101 Switching Protocols` upgrade (`:133`), and bidirectional `ws_to_tcp`/`tcp_to_ws` via `asyncio.gather` (`:238`).

## Vite PWA Details (`vite.config.ts:8`)

* `manifest`: `name: D-RATS Web`, `short_name: D-RATS`, `theme/background #1a1a2e`, `display: standalone`, `icons: /favicon.svg`.
* `workbox.globPatterns: **/*.{js,css,html,svg,png,ico,json}` — all build assets precached.
* `runtimeCaching`: `https://tile.openstreetmap.org/*` → `CacheFirst`, `maxEntries 500`, `maxAge 30 d`.

## Cache & Updates

* Service worker precaches `dist/` on install; subsequent loads are network-first for the HTML and cache-first for assets (Workbox default with `autoUpdate`).
* Map tiles are `CacheFirst` — first view requires internet, repeat views are offline.
* After a new deploy, installed clients pick it up on next launch while online (`registerType: autoUpdate` at `vite.config.ts:9`).

## Checklist

- [ ] `npm run build` succeeds (`tsc -b` + Vite)
- [ ] `dist/` served over HTTPS (or `localhost` for local install)
- [ ] Install prompt appears in Chrome/Edge (not Incognito)
- [ ] Without internet: installed app launches, Chat/Stations/Map (cached tiles) work, serial connect works
- [ ] Ratflector path tested via `ratflector-bridge.py` if that port type is used
