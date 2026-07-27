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

export class RPCEngine {
  private sessionManager: SessionManager
  private fileTransfer: FileTransferEngine | null = null
  private fileProvider: FileProvider | null = null
  private pullGate: (() => boolean) | null = null
  private deletePassword: (() => string) | null = null
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
      const result = await this.handleJob(jobType, args, sourceStation)
      if (!result) return

      await this.sendRaw(sourceStation, RPC_TYPE_ACK, seq, encodeDict(result))
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
      // moments later as an ordinary incoming file offer.
      void this.fileTransfer.sendFile(filename, data, requester)
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
