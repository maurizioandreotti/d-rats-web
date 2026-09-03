# Changelog

All notable changes to **D-RATS Web** are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
* Documentation overhaul: `docs/architecture.md`, `docs/protocols.md`, `docs/api-reference.md`, `docs/development.md`, `docs/deployment.md`, `docs/testing.md`, `CONTRIBUTING.md`, `SECURITY.md`.

## [0.1.2] — 2026-05-11
* PWA: `vite-plugin-pwa` `autoUpdate`, workbox cache for `**/*.{js,css,html,svg,png,ico,json}` and OSM tiles `CacheFirst` 30 d (`vite.config.ts:8`).
* File transfer: windowed `DAT/REQACK/ACK` with id rewrite fix, auto-accept `OK`, `cancelTransfer`, file-level single-shot `deflate` before chunking (`src/engine/file.ts:6`).
* RPC: `FILE_LIST`/`PULL`/`DELETE` on fixed session `2`, `US/RS/GS` dict codec, gated by `allowRemoteFileTransfers`/`remoteDeletePassword` (`src/engine/rpc.ts:9`).
* GPS: NMEA + GPS-A/APRS `$$CRC` MIC-tolerant parsing, `distance`/`bearing`/`toMaidenhead` (`src/engine/gps.ts:5`).
* Stores: `useConfigStore` `drats-config` v3 (`src/store/config-store.ts:14`), `IndexedDB` `drats-web/handles` for folder handle (`src/engine/local-files.ts:10`).

## [0.1.0] — Initial PWA port
* Web Serial with XON/XOFF, DTR/RTS, 8-B chunked writes (`src/engine/serial.ts:56`), `Transport` SOB/EOB (`src/engine/transport.ts:5`), multi-port `TransportManager` (`src/engine/transport-manager.ts:13`).
* DDT2 codec `0xDD`/`0x22`, header `25 B`, `~` padding, `yEnc` + CRC-CCITT `0x1021` (`src/engine/ddt2.ts:5`, `src/engine/crc.ts:1`, `src/engine/yencode.ts:1`).
* Sessions: control-channel negotiation `T_NEW/T_ACK/T_END` on session `0` with `10 × 5 s/15 s` retries (`src/engine/session-mgr.ts:41`).
* Chat on session `1`: `DEF/PING_REQ/PING_RSP/PING_ERQ/PING_ERS/STATUS` (`src/engine/chat.ts:11`), `useDratsEngine` wiring (`src/hooks/useDratsEngine.ts:23`).

[Unreleased]: https://github.com/maurizioandreotti/d-rats-web/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/maurizioandreotti/d-rats-web/releases/tag/v0.1.2
[0.1.0]: https://github.com/maurizioandreotti/d-rats-web/releases/tag/v0.1.0
