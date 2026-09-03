# Protocols — D-RATS Web

> Wire-compatible with the legacy D-RATS Python peer (`../d-rats/` read-only reference). File:line citations are for the TypeScript implementation; semantics match the Python `d_rats/*` and `d_rats/sessions/*` sources named in each section.

## 1. Overview & Session Model

D-RATS multiplexes several conversational protocols over a single half-duplex serial or TCP stream using **DDT2 framing** (`src/engine/ddt2.ts:5`) and **session ids** (`src/engine/ddt2.ts:12`, `src/engine/control.ts:10`):

| Session | Id | Set-up | Engine |
|---------|----|--------|--------|
| **Control** | `0` `SESSION_CONTROL` | implicit | `session-mgr.ts:165` handles NEW/ACK/END |
| **Chat** | `1` `SESSION_CHAT` | fixed/stateless | `chat.ts:20` |
| **RPC** | `2` `SESSION_RPC` | fixed/stateless | `rpc.ts:9` |
| **Position (ad-hoc)** | `7` `SESSION_POSITION` | fixed/stateless | `useDratsEngine.ts:90` plain-text `"position?"` |
| **File transfer** | `3 … 254` | **control-channel negotiated** (`session-mgr.ts:314`) | `file.ts:54` |
| (general/socket/form) | `1,4,6` | negotiated but not used here | `control.ts:10` constants only |

Fixed sessions never undergo control-channel negotiation and bypass id-rewrite (`session-mgr.ts:292` excludes `0,1,2`). Negotiated sessions use **directional ids**: each side picks its own `localId` (`session-mgr.ts:229,316`); the sender's `outgoing()` rewrites `sessionId: local→remote` (`:299`), so each direction is addressed with the peer's id.

## 2. DDT2 Frame — `ddt2.ts:5`

### 2.1 On-the-Wire Encapsulation

```
wire = [SOB]  yEnc( rawFrame )  [EOB]
      5 B                variable          5 B
SOB = 0x5B 0x53 0x4F 0x42 0x5D  ("[SOB]")  :5
EOB = 0x5B 0x45 0x4F 0x42 0x5D  ("[EOB]")  :6
```

`Transport.parseFrames :67` locates SOB/EOB pairs, slices inclusive, and `decodeFrame` on each span; `encodeFrame :72` wraps after yEnc. The buffer is a sticky `Uint8Array`, so frames may arrive split across serial reads. A pending `SOB` without its `EOB` suppresses GPS/raw matching (`transport.ts:54`) to avoid corrupting a half-frame with text heuristics.

### 2.2 Raw Frame Layout (`HEADER_SIZE = 25 :10`)

Packed big-endian per `AGENTS.md:75` `struct.pack("!BHBBHH8s8s", …)`:

| Offset | Size | Field | Notes (`ddt2.ts:88`) |
|--------|------|-------|----------------------|
| 0 | 1 | `magic` | `0xDD` compressed, `0x22` uncompressed (`:8`) |
| 1 | 2 | `seq` | BE `uint16` — file-transfer block number mod 256, else 0 |
| 3 | 1 | `sessionId` | destination session (after id-rewrite) |
| 4 | 1 | `type` | semantics depend on session (chat vs control vs DAT/ACK/REQACK) |
| 5 | 2 | `checksum` | CRC-CCITT over header (zeroed field) + compressed payload (`:97`) |
| 7 | 2 | `length` | BE `uint16` of (possibly compressed) `data` length |
| 9 | 8 | `s_station` | `padCallsign('~')` (`:22`) |
| 17 | 8 | `d_station` | same; `CQCQCQ` is broadcast |

Followed by `data[length]` bytes (possibly deflated before CRC).

### 2.3 Transform Pipeline

```
encodeFrame (compress=true default :72):
  data --deflate?--> headerBase[25] (checksum=0) --concat--> crcInput --computeCrc--> checksum
      --> header + data --concat--> raw --yencode--> SOB+encoded+EOB

decodeFrame (:112):
  find SOB/EOB -> ydecode -> header checks (25 B, magic 0x22/0xDD) -> slice payload length
      -> recompute CRC over header(zeroed, :149) + payload -> mismatch=>null
      -> inflate? (0xDD) else raw -> DDT2Frame
```

`padCallsign :22` pads/truncates UTF-8 of `call.padEnd(8,'~')`; `trimCallsign :28` strips `0x7E` only (not NUL/space, matching Python exactness — `AGENTS.md:102`).

### 2.4 Compression

`deflate` / `inflate` (`:56`) via `CompressionStream('deflate')` / `DecompressionStream` (`drain :34` helper). Two layers: DDT2's per-frame deflate (optional) plus file-transfer's **file-level** single-shot deflate before chunking (`file.ts:401`) — the latter's chunks are not individually inflatable; they are concatenated then inflated once on receipt (`file.ts:220`).

### 2.5 CRC — `crc.ts:1`

Bitwise CCITT poly `0x1021` (`:8`), `computeCrc :18` seeds `0`, feeds data then two zero bytes. Covers header with checksum zeroed concatenated with compressed payload. `verifyCrc :24`.

### 2.6 YEnc — `yencode.ts:1`

`OFFSET 64`, `ESC 0x3D '='` (`:1`). `DEFAULT_BANNED :4` — `0x11,0x13,0x1a,0x00,0x84,0xe7,0xfd,0xfe,0xff,0xc0,0xdb`. `yencode :8` maps each banned or `=` byte to `[ESC, (b+OFF)&0xff]`; `ydecode :20` subtracts offset after `ESC`.

## 3. Control Channel — Session 0 (`control.ts:1`, `session-mgr.ts:165`)

Negotiates negotiated sessions and tears them down. Frame types on session 0 (`control.ts:5`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `CONTROL_TYPE_PING` | `0` | ping (not used by this client beyond chat STATUS) |
| `CONTROL_TYPE_END` | `1` | end-of-session echo protocol |
| `CONTROL_TYPE_ACK` | `2` | new-session ack |
| `CONTROL_TYPE_NEW_BASE` | `3` | base; actual `type = 3 + sessionType` (`:16`) |

`SESSION_TYPE_*` values (`:10`): `GENERAL 1, SOCKET 4, FILEXFER 5, FORMXFER 6, RPC 7` (FILEXFER is the one exercised; others are constants).

**Payloads** (`:20`):

* **NEW** `type = NEW_BASE + sessionType` → `encodeNewSessionRequest(localId, name)`: `[localId:1][UTF8(name)]`; `decodeNewSessionRequest` validates `≥1 B`.
* **ACK** `type=2` → `encodeSessionAck(requesterId, ownId)`: `[requesterId, ownId]`; peer stores `remoteId`.
* **END** `type=1` → `encodeSessionEnd(id)`: `UTF8(String(id))`; peer echoes `END(replyId)`.

**FSM** (`session-mgr.ts:165`):

* Ingress: if `dest !== station` drop; `ACK` → promote `sync→open`, resolve `pendingAcks`; `END` → if record absent drop echo loop, else delete, echo `END(remoteId??localId)`, resolve `pendingEnds`; `NEW` → dedup on `remoteId+dest`, allocate `nextSessionId`, store `open`, send ACK, fire `onIncomingSession`.
* Egress: `startSession :314` allocates `sync` record, loops `NEW_SESSION_RETRIES=10` (`:41`) with `FIRST 5000` then `REST 15000` waits — matches Python `control.py:new_session` half-duplex timing — else throw; `endSession :349` sends `END` and waits `END_RETRIES=3 × 10000` for peer echo.
* Port-aware send (`outgoing :281`) routes replies to the port the peer was `heardOnPort` on; stale ports are ignored.
* Id-rewrite (`:292`) excludes fixed `0,1,2`; `onMissingRemoteId` diagnoses premature sends.

## 4. Chat — Session 1 (`chat.ts:11`)

Stateless broadcast. Types (`:11`): `DEF 0, PING_REQ 1, PING_RSP 2, PING_ERQ 3, PING_ERS 4, STATUS 5`.

| Type | Payload | Behaviour (`handleIncoming :53`) |
|------|---------|---|
| `DEF` | UTF-8 text | if not `$GP`/`$$CRC`, `onMessage`; also `parseGps → onGpsFix` |
| `PING_REQ` | `"Ping Request"` default (`:132`) | `onPing(request)`, if `dest==myCall||CQCQCQ` then `CQCQCQ→ sleep rand 0-5 s` (`:77`), reply `PING_RSP` with `pingInfo||'Running D-RATS Web'`, `onPing(response)`, then `sendStatus('D-RATS Web')` |
| `PING_RSP` | `pingInfo` | `onPing(response)` |
| `PING_ERQ` | arbitrary bytes | same guard, `CQCQCQ→ 0-10 s` (`:99`), reply same bytes as `PING_ERS` |
| `PING_ERS` | echo back | `onPing(echo_response)` + resolve `pingEchoHandlers[station]` (`:109`) |
| `STATUS` | `"<byte><text>"` (`:144` sends `"1"+message` to `CQCQCQ`) | first char → status, rest → `onStatus` (`:117`) |

Sends (`:126`): `sendText(text, dest='CQCQCQ')`, `sendPing`, `sendPingEcho` (optionally registers `callback` for the `ERS`), `sendStatus` — all built with `magic 0x22, seq 0, session 1, checksum 0` and dispatched via `SessionManager.outgoing`.

Position shortcut: session `7` is not part of this protocol; it is handled one layer up in `useDratsEngine.ts:90` as plain-text `"position?"` → `position_request` ping, else `parseGps` → `position_response`.

## 5. File Transfer — Negotiated Session (`file.ts:6`)

A **stateful, reliable, windowed** transfer on a negotiated session (`SESSION_TYPE_FILEXFER=5` channel established via control NEW `type=8`).

### 5.1 Constants & Wire Types

`FILE_BLOCK_SIZE 1024, FILE_WINDOW_SIZE 8 (effective 4 :348), FILE_MAX_RETRIES 10, FILE_MIN_TIMEOUT_MS 4000, FILE_OFFER_RESPONSE_TIMEOUT_MS 20000` (`:6`). DDT2 types on the negotiated session (`:16`): `ACK 1, DAT 4, REQACK 5`; `seq` is block number mod 256 (`nextSeq :248`).

### 5.2 Offer / Accept (data-channel, not a distinct control type)

Offer payload (`sendFile :423`): `[uint32LE compressedSize][UTF8(filename)]` as a single `DAT` block. Receiver in `awaiting-offer` (`:123`) parses size+filename, sets `expectedSeq=(seq+1)%256`, phase `awaiting-accept`, fires `onOffer`, then **auto-accepts** (`:137`) via `acceptOffer :479` which does `sendReliable([Uint8Array("OK")])` — matching Python `file.py:recv_file` (no user gate). Resume `"RESUME:<offset>"` (`:448`) is parsed but never generated (always `"OK"`).

Sender after `sendReliable(offer)` waits `waitForData(20000)` (`:432`) for `"OK"`/`RESUME`; `"OK"`→ `transferring`, else phase `failed` and throw.

### 5.3 Windowed Reliable Transport (`sendReliable :342`)

1. Map `chunks→blocks{seq,nextSeq}` (mod 256).
2. For each window `[base, base+windowSize)` (max 4 with default block size): clear `pendingAcked[session]`, `sendDataBlock` each as `DAT(seq, data)` (`:254`), then retry loop: compute `pending = window \ acked`, `sendReqAck(pending seqs)` (`:271`), `waitForAckSeqs(timeout = 4000*(attempt+1))` (`:289` inbox pattern) until window fully acked or 10 retries → throw. `onWindowSent(sentBytes)` reports incremental progress (`:464`).

Receiver (`:156, :172`): `ACK` data bytes are seq numbers to mark `pendingAcked`; `REQACK` payload is the list of desired seqs — responder replies `ACK` with `intersection(req, recvList)` (`:174`) using `dest = peer` (not self) header.

### 5.4 Reassembly (`deliverInOrder :195`)

`recvList` records every `DAT seq`. `expectedSeq` advances in-order; out-of-order chunks go to `outOfOrder` map and are drained when the gap fills. Each `DAT` contributes to `chunks[]` and `receivedBytes`. When `receivedBytes >= totalSize`, the concatenated `chunks` (still the single file-level zlib stream) is **concatenated then `inflate` once** (`:220`) → `decodedData`, phase `complete`, `onProgress(100%)`, `endSession`. Progress coalesced with the sender's `onWindowSent` so the UI advances window-by-window, not 0→100%.

### 5.5 Controls

`cancelTransfer :497` sets phase `failed`, wakes `ackWaiters/dataWaiters`, `endSession` — checked inside `sendReliable` windows so a user Stop aborts mid-retry, not after a 20 s timeout.

## 6. RPC — Fixed Session 2 (`rpc.ts:9`)

No negotiation; `SESSION_RPC=2` (`ddt2.ts:16`) is convention. `RPC_TYPE_REQUEST 0 / ACK 1` (`:9`), `TIMEOUT 30000` (`:21`), `seq` is `ident 0..65535` (`:283`).

### 6.1 Dict Codec

Separators (`:13`): `US \x1f, RS \x1e, GS \x1d`. `encodeDict :56` → `k US v` joined by `RS`; `decodeDict :62` splits RS then on first US. `formatFileListInfo :41` → `"<n> B|KB (<YYYY-MM-DD HH:MM:SS>)"` — KB is `/1024` truncated (no MB), 4-token `B/KB`+parens required by Python `value.split(" ")`.

### 6.2 Jobs

| Job | Constant (`:17`) | Args dict | Notes |
|-----|------------------|-----------|-------|
| `RPCFileListJob` | list | `{}` | server returns `Record<filename, info>` |
| `RPCPullFileJob` | pull | `{fn: filename}` | gated by `allowRemoteFileTransfers` |
| `RPCDeleteFileJob` | delete | `{fn, passwd}` | gated by `remoteDeletePassword` |

**Server** `handleJob :207`: list → `fileProvider.list()`; pull → check `pullGate()` else `{rc:'Remote file transfers not enabled'}`, else `get(fn)` else `File not found`, or `fileTransfer` missing else, then **fire-and-forget** `fileTransfer.sendFile(fn,data,requester, onPullSend).catch(onPullSendError)` and return `{rc:'OK'}` synchronously; delete → compare `args.passwd === configured||''` (empty configured always rejects) else `remove(fn)`.

**Client** `handleIncoming :166`: `ACK` type resolves `pendingCalls[seq]` via `decodeDict`; `REQUEST` type splits on `GS` → `jobType` + `args dict`, calls `handleJob`, then `sendRaw(ACK, seq, encodeDict(reply))` with `onJobServed/onJobError` diagnostics. Outbound `listFiles/pullFile/deleteFile :254` call `submit :276` which writes `payload = jobType GS encodeDict(args)` and races `sendRaw(REQUEST, ident, payload)` against `30 s` rejection (`pendingCalls` map).

`FileProvider :26` is the `local-files-store + local-files.ts` folder (`useDratsEngine.ts:203`).

## 7. GPS / APRS / GPS-A — `gps.ts:5`

All checksum mismatches are warn-only: serial capture artifacts make strict drop worse than a bad fix.

* **NMEA checksum** `warnIfNmeaChecksumBad :5` — XOR `1..'*'` vs `*HH`, warn if missing.
* **GPS-A MIC** `gpsaChecksum :21` — reversed CRC-16 init `0xffff` poly `0x8408` bit-reflected, final `~crc`.
* `parseNmea :42` — `$GPGGA` (lat/lon/alt fields 2,3,4,5,9), `$GPRMC` (status A, lat/lon/speed/course), `$GPGLL` (lat/lon); fields via `nmeaValueToDeg :35` (`deg + min/60`, neg if `S/W`).
* `GPS_A_BODY :117` — `(?:[@/]\d{6}[zh/]|[!=]) lat(\d..\d) N/S symTable? lon(\d..\d) E/W symCode comment /A=nnnnnn?`.
* `APRS_DATA_TYPE_IDS :123` — `['!','/','=', '@',';',':', '>','?','`',"'",')','_','T','$','%',',','#','*','&']` — distinguishes APRS reports from free-text Chat.
* `splitGpsaFrame :155` — `^\$\$CRC([0-9A-Za-z]{4}),([\s\S]*)$` → warn on MIC, split on `:` into `stationField` (`CALL>DEST` before `,`) and `data`.
* `parseIcomGps :184` / `parseRawNmeaGps :204` / `parseAprs :174` / `parseAprsPosition :180` / `parseGps :240` compose the above.
* `Transport.matchGps :96` extracts either NMEA pair + station, or `$$CRC..., ...\r` from the serial byte stream before falling through to raw text.
* **Utilities**: `distance :244` haversine `R=6371000`, `bearingTo :294` atan2, `toMaidenhead :264` clamped to `[-90,90)±[-180,180)` → 6-char field/square/subsq.

## 8. Ratflector Bridge — `ratflector-bridge.py:1`, `ratflector.ts:8`

Browser cannot dial raw TCP. The bridge (`ratflector-bridge.py:83`) binds `0.0.0.0:9001` (`:255`), awaits `GET /?host=H&port=P` with `Sec-WebSocket-Key`, computes `Sec-WebSocket-Accept` (`:28`), responds `101`, then `asyncio.open_connection(H,P)` with 10 s timeout; on failure it sends an error `WebSocketFrame opcode 1` and `close 8`. It immediately forwards any welcome bytes already buffered on TCP (`:172`), then runs `ws_to_tcp` (`:182`) and `tcp_to_ws` (`:214`) concurrently via `asyncio.gather`, handling `opcode 8 close`, `9 ping→10 pong`, `1/2 text|binary` payloads through `WebSocketFrame.encode/read_frame` (`:34`).

The browser client `RatflectorConnection.connect :32` dials `bridgeUrl||ws://localhost:9001/?host=H&port=P`, `binaryType arraybuffer`, `doAuth :149` awaits `authQueue/authResolve` lines matching `^\d{3}\s+` with `AUTH_TIMEOUT 10 s` (`:6`): welcome `100→connected`, `101→send USER calsign`, `200→connected`, `102→send PASS password→200`, else throw; thereafter `buffer` + `parseFrames` SOB/EOB loop identical to serial Transport (`:201`).

WSL2 note (`AGENTS.md:99`): the `localhost` proxy breaks upgrade; use `http://<WSL-VM-IP>:9001`.

## 9. Serial Link Behaviour — `serial.ts:56`, `transport-manager.ts:146`

* **Flow** XON `0x11` / XOFF `0x13` (`:1`) filtered in the read loop; write respects a single per-frame XOFF budget `15000` (`:87`) rather than per-chunk, so a stalled peer doesn't hold the queue for minutes.
* **DTR/RTS** asserted `true/true` three times (`:145`) before `readLoop`; needed for ICOM USB dongle power.
* **Warmup** on connect (`transport-manager.ts:146`): `DDT2Frame{magic 0x22, seq 0, session 0, type 254, s '!', d '!', length 16, data 16×0x01}`, `compress false` — wakes radio from power-save.
* **Callsign guard**: `isValidCallsign :6` regex `^[A-Za-z]{1,2}\d[A-Za-z0-9]{1,4}([-/][A-Za-z0-9]{1,3})?$` — checked on every `handleFrame` src (`useDratsEngine.ts:43`) and `parseIcomGps :191` to drop corrupted frames before they pollute `heardStations`.

## 10. Testing the Protocols

All layers are exercised without radios via in-memory pairs:

* `file-transfer.test.ts` — two `SessionManager+FileTransferEngine` wired callback-to-callback, full NEW/offer/window/ACK/END and rejection path.
* `rpc.test.ts` — `RPCEngine` list/pull/delete, pull triggers a real `sendFile` on the peer, password & gate error cases.
* `session-mgr.test.ts` — `setRetryTiming` fast path, dedup, id-rewrite, teardown.
* `transport.test.ts` — fragmented SOB/EOB across `addDataCallback` calls, `hasBufferedData`.
* `ddt2.test.ts` — encode/decode round-trip with/without compress, CRC corruption -> `null`.

Ratflector and real-radio reception remain manual (see `AGENTS.md:132`).

## 11. Cross-References

* Architecture (layering, stores, UI flows): [`architecture.md`](./architecture.md)
* Symbol-level API: [`api-reference.md`](./api-reference.md)
* User wiki (radio setup, ICF files, troubleshooting): [`wiki/index.md`](./wiki/index.md)
* Agent notes: [`../AGENTS.md`](../AGENTS.md)

