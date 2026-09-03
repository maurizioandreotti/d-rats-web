# Testing Guide

## Toolchain

* **Vitest 4** (`vitest.config.ts:1`, `package.json:50`) with `jsdom` env — no radios needed for unit tests
* **Testing Library** (`@testing-library/react`, `jest-dom`) for component tests (if added)
* **TypeScript** project `tsc -b` as a correctness gate

## Running Tests

```bash
npm run test        # vitest run — single shot
npm run test:watch  # vitest watch mode
npm run typecheck   # tsc -b (no emit) — required in CI
```

## What's Covered (`src/engine/*.test.ts`)

All protocol layers are tested **in-memory** without serial/WebSocket:

| Test file | What it proves | Pattern |
|-----------|----------------|---------|
| `ddt2.test.ts` | Encode→decode round-trip, `0xDD`/`0x22` magic, CRC corruption → `null`, compress toggle, station trim/pad `~` | Pure function calls to `encodeFrame`/`decodeFrame` (`src/engine/ddt2.ts:72`) |
| `transport.test.ts` | SOB/EOB framing across fragmented `addDataCallback` chunks, `hasBufferedData`, GPS/raw fast paths suppressed when SOB pending | In-memory `RadioSerial` stub → `Transport` (`src/engine/transport.ts:67`) |
| `session-mgr.test.ts` | `T_NEW`/`ACK`/`END` FSM, `local→remote` id rewrite (`session-mgr.ts:292`), dedup, teardown echo, retry via `setRetryTiming({newSessionRetryMsFirst:10,…})` | Two `SessionManager` instances wired via `setOutgoingCallback` |
| `file-transfer.test.ts` | Full handshake `NEW(5)` → offer `[u32LE size][name]` → auto `OK` → windowed `DAT/REQACK/ACK` → `inflate` & `endSession`; rejection & `cancelTransfer` paths | Two `SessionManager+FileTransferEngine` pairs wired callback-to-callback (no serial) |
| `rpc.test.ts` | `FILE_LIST`/`PULL`/`DELETE` dict codec (`US/RS/GS`), pull fire-and-forget triggers peer `sendFile`, gates `allowRemoteFileTransfers` / `remoteDeletePassword` | Two `RPCEngine` instances sharing an in-memory `FileProvider` |
| `gps.test.ts` | NMEA `$GPGGA/$GPRMC/$GPGLL`, GPS-A `$$CRC` MIC tolerance, `APRS_DATA_TYPE_IDS`, `distance`/`bearing`/`toMaidenhead` | Fixture strings through `parseNmea`/`parseIcomGps` (`src/engine/gps.ts:42`) |

## Writing New Tests

Place `*.test.ts` next to the module under `src/` (Vitest `include: ['src/**/*.{test,spec}.{ts,tsx}']`). Prefer in-memory wiring over mocks:

```ts
// Example pattern from file-transfer.test.ts:1
const aSess = new SessionManager(); aSess.setStation('A');
const bSess = new SessionManager(); bSess.setStation('B');
// wire opposite directions
aSess.setOutgoingCallback(async (f) => { await bSess.incoming(f); });
bSess.setOutgoingCallback(async (f) => { await aSess.incoming(f); });
const aFile = new FileTransferEngine(aSess);
const bFile = new FileTransferEngine(bSess);
// drive the protocol, assert onProgress / getCompletedData
```

For `SessionManager` timing, use `setRetryTiming()` to avoid 15 s sleeps:

```ts
sess.setRetryTiming({ newSessionRetries: 2, newSessionRetryMsFirst: 5, newSessionRetryMsRest: 5 });
```

## Manual / Integration Tests

Real radios and ratflectors are not emulated in unit tests:

* **Serial**: connect an ICOM D-STAR (see `docs/wiki/radio-setup.md`), watch `Sniffer` (`src/components/SnifferPanel.tsx:1`) RX/TX hex and `Event Log` (`src/store/event-store.ts:3`), verify chat `CQCQCQ`, ping, and `$$CRC` GPS → station pin on the map.
* **Ratflector**: run `ratflector-bridge.py --port 9001`, configure a second port as `ratflector` type pointing at `ws://localhost:9001` (on WSL2 use `ws://<VM-IP>:9001` at `src/engine/ratflector.ts:40`), verify `onStatus` `connecting→connected`.
* **File transfer to Python peer**: not yet verified (`AGENTS.md:132` — self-to-self is covered, real-peer interop is pending).

## CI Suggestions (`.github/workflows/ci.yml`)

```yaml
name: ci
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

## Coverage

Vitest coverage via `v8` is available (`vitest --coverage`). The goal is to keep `src/engine/` above 80% — it is the correctness boundary with the Python peer. Regressions in `ddt2`, `session-mgr`, `file`, or `rpc` should block merge.

## Debugging Failures

* Decode `null` → check CRC/YEnc/zlib: `Transport.setOnDecodeError` and `RatflectorConnection.setOnDecodeError` log to `useEventStore` (`src/engine/transport.ts:27`, `src/engine/ratflector.ts:28`).
* `Missing remote id` → `SessionManager.setOnMissingRemoteId` (`src/engine/session-mgr.ts:109`) fires when `outgoing` rewrites before `ACK` arrived.
* Dropped file frames → `FileTransferEngine.setOnDrop` (`src/engine/file.ts:108`).
* RPC silent failures → `RPCEngine.setOnJobError` / `setOnPullSendError` (`src/engine/rpc.ts:158`, `useDratsEngine.ts:239`).
