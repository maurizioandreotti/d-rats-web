# D-RATS Web Wiki

- [Features](features.md) — What's implemented: chat, stations, position requests, map, file transfer (local folder + remote RPC browsing), config, sniffer, event log
- [Radio Setup](radio-setup.md) — Serial port configuration, settings tables per ICOM model, GPS TX setup, ICF programming files, ratflector gateway
- [Technical Aspects](technical.md) — D-STAR RF layer vs serial data, Own Callsign 1/2, callsign suffixes (/P), ICOM GPS data format
- [Troubleshooting](troubleshooting.md) — No data from radio, GPS positions not appearing, ping not getting response

## Developer Docs

- [Architecture](../architecture.md) — layered architecture, engine, stores, UI flows
- [Protocols](../protocols.md) — DDT2, control, chat, file, RPC, GPS, ratflector wire formats
- [API Reference](../api-reference.md) — symbol-level engine/store/hook/component API
- [Development](../development.md) — setup, scripts, conventions
- [Deployment](../deployment.md) — build, PWA install, static hosting, bridge
- [Testing](../testing.md) — Vitest patterns & manual radio verification

See also: [../README.md](../README.md) · [../../CONTRIBUTING.md](../../CONTRIBUTING.md) · [../../SECURITY.md](../../SECURITY.md)

## Quick Reference

| Topic | Page |
|-------|------|
| Browsing/pulling files from another station | [Features → File Transfer](features.md#file-transfer) |
| Sharing your own files with other stations | [Features → File Transfer → Local](features.md#local-left) |
| ID-51, IC-2820, ID-5100 serial settings | [Radio Setup → ICOM](radio-setup.md#icom-d-star-radios) |
| GPS position TX configuration | [Radio Setup → GPS](radio-setup.md#icom-id-51a--id-51e--id-51a) |
| ICF programming files (support-material/) | [Radio Setup → ICF](radio-setup.md#icf-programming-files) |
| No data / no GPS / no ping | [Troubleshooting](troubleshooting.md) |
| /P suffix not showing in app | [Technical → Callsign Suffixes](technical.md#callsign-suffixes-p-r-etc) |
| ICOM GPS NMEA + station ID format | [Technical → ICOM GPS Data Format](technical.md#icom-gps-data-format) |
