# D-RATS Web

Browser-based D-RATS client for emergency ham radio communication. No backend server — runs entirely in the browser using Web Serial API.

Built with React + TypeScript + Vite.

## Prerequisites
- **Browser**: Chrome or Edge (required for Web Serial API support)
- **Radio**: ICOM D-STAR radio with USB data dongle
- **No internet required** after initial load — works fully offline as a PWA

## Development

```bash
npm install
npm run dev
```

## Build

- download code in local folder,
- open a terminal in the same folder
- execute:
```bash
npm run build
npm run preview
```

## Installing as a Local App (No Web Server Required Afterward)

The app can be installed as a standalone desktop app (PWA) and used entirely offline, with no ongoing server, deployment, or internet connection needed. A local server is only required briefly, once, for the install step itself — this is a browser security requirement (service workers and Web Serial/File System Access both require a "secure context": `https://` or `http://localhost`, never `file://`), not something this project can skip.

1. **Build once**: `npm run build` (produces `dist/`). Use this, not `npm run dev` — the service worker is only enabled in the production build, not the dev server.
2. **Serve `dist/` on localhost** — any static server works: `npm run preview`, `npx serve dist`, `python3 -m http.server` from inside `dist/`, etc.
3. Open the printed `http://localhost:...` URL in **Chrome or Edge** (Web Serial requires a Chromium-based browser — this also rules out Firefox and Safari for the install prompt).
4. Click the **Install** icon in the address bar (or browser menu → "Install D-RATS Web…"). This creates a standalone app window with its own shortcut/icon, no browser chrome.
   - Not seeing the install icon? Chrome/Edge disable the install prompt entirely in **Incognito/InPrivate windows** — use a regular window. If it's still missing in a normal window, check DevTools → Application → Service Workers for a registration error.
5. **Stop the server** — the installed app now runs from the service worker's cache and has no further dependency on it. Radio/chat/file-transfer functionality works fully offline; only fresh OpenStreetMap map tiles still require internet (already-viewed tiles are cached).

## Hosting Publicly (For Other Users)

You don't need your own server or localhost for this — any static host works, since the app has no backend. Deploy the contents of `dist/` (from `npm run build`) to something like GitHub Pages, Netlify, Vercel, or Cloudflare Pages, then anyone can install it straight from the URL the same way as above.

- Must be served over **HTTPS** — a public `http://` origin does not count as a secure context (only `http://localhost` gets that exception). Any of the hosts above provide HTTPS by default.
- `registerType: 'autoUpdate'` is already configured, so installed copies pick up new deployments automatically next time they're online — no manual reinstall needed.
- Nothing sensitive is exposed by public hosting: the app is 100% client-side, with no server secrets, and each user's config/callsign stays in their own browser's local storage only.

## License

GNU General Public License v3.0
