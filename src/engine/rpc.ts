import type { DDT2Frame, RemoteFileEntry } from '../types'
import { SESSION_RPC } from './ddt2'
import { SessionManager } from './session-mgr'
import type { FileTransferEngine } from './file'

// Wire format for the RPC session (DDT2 session id 2, fixed slot — never
// negotiated over the control channel). Single request/ack per call, no
// windowing or retransmission: the caller just gives up after RPC_TIMEOUT_MS.
export const RPC_TYPE_REQUEST = 0
export const RPC_TYPE_ACK = 1

// Field separators matching the reference protocol's flat dict encoding.
const UNIT_SEPARATOR = '\x1f'
const RECORD_SEPARATOR = '\x1e'
const GROUP_SEPARATOR = '\x1d'

export const JOB_FILE_LIST = 'RPCFileListJob'
export const JOB_PULL_FILE = 'RPCPullFileJob'
export const JOB_DELETE_FILE = 'RPCDeleteFileJob'

const RPC_TIMEOUT_MS = 30000

// Serves the responder side of file-list/pull/delete requests, backed by
// the real folder the user picked for the Local pane (local-files.ts) —
// reads are async since File System Access API access always is.
export interface FileProvider {
  list(): Promise<RemoteFileEntry[]>
  get(name: string): Promise<Uint8Array | null>
  remove(name: string): Promise<boolean>
}

// Matches D-RATS's rpc_file_list exactly (rpc.py): integer bytes, or KB via
// a truncating right-shift with no further MB scaling (D-RATS never shows
// MB, however large the file), plus a "YYYY-MM-DD HH:MM:SS" timestamp —
// e.g. "512 B (2024-05-01 10:22:31)". This isn't cosmetic: the reference
// UI (main_files.py) unpacks this value with a strict, unguarded
// `size_str, units, file_date, file_time = value.split(" ")` expecting
// exactly 4 space-separated tokens. A locale-formatted date (extra comma,
// AM/PM) or a decimal size produces a different token count and throws
// "too many values to unpack" on the real peer, uncaught.
export function formatFileListInfo(sizeBytes: number, mtimeMs: number): string {
  let size = Math.floor(sizeBytes)
  let units = 'B'
  if (size >= 1024) {
    size = Math.floor(size / 1024)
    units = 'KB'
  }

  const d = new Date(mtimeMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  return `${size} ${units} (${timeString})`
}

export function encodeDict(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}${UNIT_SEPARATOR}${value}`)
    .join(RECORD_SEPARATOR)
}

export function decodeDict(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!text) return result

  for (const pair of text.split(RECORD_SEPARATOR)) {
    const sepIdx = pair.indexOf(UNIT_SEPARATOR)
    if (sepIdx === -1) continue
    result[pair.slice(0, sepIdx)] = pair.slice(sepIdx + 1)
  }
  return result
}

interface PendingCall {
  resolve: (result: Record<string, string>) => void
  reject: (err: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// Fired synchronously, right before a pull-triggered send starts, so the UI
// layer can create a Transfers-list entry the same way a manual Upload
// click does. Returns a callback that receives the real session id once
// the underlying FileTransferEngine.sendFile() negotiates it.
export type PullTriggeredSendCallback = (
  filename: string,
  size: number,
  station: string,
) => (sessionId: number) => void

// Fired if the pull-triggered send itself fails (e.g. the peer never acks
// the offer) — sendFile() is otherwise fire-and-forget from handleJob's
// perspective, which was silently swallowing errors with no trace anywhere.
export type PullSendErrorCallback = (filename: string, station: string, error: unknown) => void

// Fires for every inbound job we serve, with the reply we're about to send.
// Serving a request is otherwise completely silent from the UI's side: the
// only visible trace is the generic incoming/outgoing frame lines, which say
// nothing about whether the peer got a usable answer.
export type JobServedCallback = (
  jobType: string,
  requester: string,
  reply: Record<string, string>,
) => void

// Fires when serving a job throws, or when the reply itself fails to go out.
// Both used to propagate as an unhandled rejection out of handleIncoming()
// (nothing above it catches), so the peer just saw silence.
export type JobErrorCallback = (jobType: string, requester: string, error: unknown) => void

export class RPCEngine {
  private sessionManager: SessionManager
  private fileTransfer: FileTransferEngine | null = null
  private fileProvider: FileProvider | null = null
  private pullGate: (() => boolean) | null = null
  private deletePassword: (() => string) | null = null
  private onPullSend: PullTriggeredSendCallback | null = null
  private onPullSendError: PullSendErrorCallback | null = null
  private onJobServed: JobServedCallback | null = null
  private onJobError: JobErrorCallback | null = null
  private pendingCalls = new Map<number, PendingCall>()
  private nextIdent = 0

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  // Needed so a successful pull-file ack can kick off the actual byte
  // transfer, which travels over its own separately negotiated session —
  // the RPC exchange itself only ever carries a small status reply.
  setFileTransferEngine(fileTransfer: FileTransferEngine): void {
    this.fileTransfer = fileTransfer
  }

  setFileProvider(provider: FileProvider): void {
    this.fileProvider = provider
  }

  // Matches D-RATS's prefs.allow_remote_files checkbox — gates pulls only,
  // not listing (rpc_file_list has no such gate in the reference either).
  setPullGate(gate: () => boolean): void {
    this.pullGate = gate
  }

  // Matches D-RATS's remote_admin_passwd — an empty configured password
  // means remote delete is always rejected, regardless of what's sent.
  setDeletePassword(getPassword: () => string): void {
    this.deletePassword = getPassword
  }

  setOnPullSend(cb: PullTriggeredSendCallback): void {
    this.onPullSend = cb
  }

  setOnPullSendError(cb: PullSendErrorCallback): void {
    this.onPullSendError = cb
  }

  setOnJobServed(cb: JobServedCallback): void {
    this.onJobServed = cb
  }

  setOnJobError(cb: JobErrorCallback): void {
    this.onJobError = cb
  }

  async handleIncoming(frame: DDT2Frame): Promise<void> {
    const { type, seq, sourceStation } = frame.header
    const text = new TextDecoder().decode(frame.data)

    if (type === RPC_TYPE_ACK) {
      const pending = this.pendingCalls.get(seq)
      if (!pending) return
      this.pendingCalls.delete(seq)
      clearTimeout(pending.timeout)
      pending.resolve(decodeDict(text))
      return
    }

    if (type === RPC_TYPE_REQUEST) {
      const groupIdx = text.indexOf(GROUP_SEPARATOR)
      if (groupIdx === -1) return

      const jobType = text.slice(0, groupIdx)
      const args = decodeDict(text.slice(groupIdx + 1))

      let result: Record<string, string> | null
      try {
        result = await this.handleJob(jobType, args, sourceStation)
      } catch (err) {
        this.onJobError?.(jobType, sourceStation, err)
        return
      }
      if (!result) {
        this.onJobError?.(jobType, sourceStation, new Error('Unsupported job type — no reply sent'))
        return
      }

      this.onJobServed?.(jobType, sourceStation, result)
      try {
        await this.sendRaw(sourceStation, RPC_TYPE_ACK, seq, encodeDict(result))
      } catch (err) {
        this.onJobError?.(jobType, sourceStation, err)
      }
    }
  }

  private async handleJob(
    jobType: string,
    args: Record<string, string>,
    requester: string,
  ): Promise<Record<string, string> | null> {
    if (jobType === JOB_FILE_LIST) {
      const result: Record<string, string> = {}
      for (const file of (await this.fileProvider?.list()) ?? []) result[file.name] = file.info
      return result
    }

    if (jobType === JOB_PULL_FILE) {
      const filename = args.fn
      if (!filename) return { rc: 'Missing filename' }
      if (this.pullGate && !this.pullGate()) return { rc: 'Remote file transfers not enabled' }

      const data = (await this.fileProvider?.get(filename)) ?? null
      if (!data) return { rc: 'File not found' }
      if (!this.fileTransfer) return { rc: 'Remote file transfers not enabled' }

      // Fire-and-forget: the requester gets "OK" now and the bytes arrive
      // moments later as an ordinary incoming file offer. Still fire-and-
      // forget from the RPC exchange's perspective, but give the UI layer
      // a chance to track it (onPullSend) and surface a failure
      // (onPullSendError) instead of both being silently invisible.
      const fileTransfer = this.fileTransfer
      const onSessionId = this.onPullSend?.(filename, data.byteLength, requester)
      fileTransfer.sendFile(filename, data, requester, onSessionId).catch((err) => {
        this.onPullSendError?.(filename, requester, err)
      })
      return { rc: 'OK' }
    }

    if (jobType === JOB_DELETE_FILE) {
      const filename = args.fn
      if (!filename) return { rc: 'Missing filename' }

      const configured = this.deletePassword?.() ?? ''
      if (!configured || args.passwd !== configured) return { rc: 'Incorrect password' }

      const removed = (await this.fileProvider?.remove(filename)) ?? false
      return removed ? { rc: 'OK' } : { rc: 'File not found' }
    }

    return null
  }

  async listFiles(dest: string, portName?: string): Promise<RemoteFileEntry[]> {
    const result = await this.submit(JOB_FILE_LIST, {}, dest, portName)
    return Object.entries(result).map(([name, info]) => ({ name, info }))
  }

  async pullFile(dest: string, filename: string, portName?: string): Promise<{ ok: boolean; message: string }> {
    const result = await this.submit(JOB_PULL_FILE, { fn: filename }, dest, portName)
    const rc = result.rc ?? 'No response'
    return { ok: rc === 'OK', message: rc }
  }

  async deleteFile(
    dest: string,
    filename: string,
    password: string,
    portName?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const result = await this.submit(JOB_DELETE_FILE, { fn: filename, passwd: password }, dest, portName)
    const rc = result.rc ?? 'No response'
    return { ok: rc === 'OK', message: rc }
  }

  private submit(
    jobType: string,
    args: Record<string, string>,
    dest: string,
    portName?: string,
  ): Promise<Record<string, string>> {
    const ident = this.nextIdent
    this.nextIdent = (this.nextIdent + 1) % 65536
    const payload = `${jobType}${GROUP_SEPARATOR}${encodeDict(args)}`

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(ident)
        reject(new Error(`RPC ${jobType} to ${dest} timed out`))
      }, RPC_TIMEOUT_MS)

      this.pendingCalls.set(ident, { resolve, reject, timeout })
      void this.sendRaw(dest, RPC_TYPE_REQUEST, ident, payload, portName)
    })
  }

  private async sendRaw(
    dest: string,
    type: number,
    seq: number,
    payload: string,
    portName?: string,
  ): Promise<void> {
    const data = new TextEncoder().encode(payload)
    const frame: DDT2Frame = {
      header: {
        magic: 0x22,
        seq,
        sessionId: SESSION_RPC,
        type,
        checksum: 0,
        length: data.length,
        sourceStation: this.sessionManager.getStation(),
        destStation: dest,
      },
      data,
    }
    await this.sessionManager.outgoing(frame, portName)
  }
}