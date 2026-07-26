import type { DDT2Frame } from '../types'
import { SessionManager } from './session-mgr'
import { SESSION_TYPE_FILEXFER } from './control'

export const FILE_BLOCK_SIZE = 1024
export const FILE_WINDOW_SIZE = 8
export const FILE_MAX_RETRIES = 10
export const FILE_MIN_TIMEOUT_MS = 12000
export const FILE_OFFER_RESPONSE_TIMEOUT_MS = 20000

// DDT2 header `type` values for a stateful (session id >= 2) data channel.
const STATEFUL_TYPE_ACK = 1
const STATEFUL_TYPE_DAT = 4
const STATEFUL_TYPE_REQACK = 5

export type FileTransferProgressCallback = (
  filename: string,
  transferred: number,
  total: number,
  sessionId: number,
) => void
export type FileOfferCallback = (filename: string, size: number, sessionId: number, fromStation: string) => void

type TransferPhase = 'awaiting-offer' | 'awaiting-accept' | 'awaiting-response' | 'transferring' | 'complete' | 'failed'

interface TransferState {
  sessionId: number
  destStation: string
  filename: string
  totalSize: number
  direction: 'send' | 'receive'
  phase: TransferPhase
  oseq: number
  // receive-side reassembly
  chunks: Uint8Array[]
  recvList: Set<number>
  outOfOrder: Map<number, Uint8Array>
  expectedSeq: number
  receivedBytes: number
}

export class FileTransferEngine {
  private sessionManager: SessionManager
  private activeTransfers = new Map<number, TransferState>()
  private onProgress: FileTransferProgressCallback | null = null
  private onOffer: FileOfferCallback | null = null
  // Acks/replies can arrive before the code that's about to wait for them
  // gets a chance to register a waiter (the peer may process and respond to
  // a request within the same synchronous callback chain that sent it). Both
  // pairs below use an inbox pattern so nothing is lost to that race: an
  // arriving ack/reply is recorded immediately, and waitFor*() drains
  // whatever's already there before falling back to actually waiting.
  private pendingAcked = new Map<number, Set<number>>()
  private ackWaiters = new Map<number, () => void>()
  private pendingReplies = new Map<number, Uint8Array>()
  private dataWaiters = new Map<number, () => void>()

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
    this.sessionManager.setOnIncomingSession((localId, sessionType, sourceStation) => {
      if (sessionType !== SESSION_TYPE_FILEXFER) return

      this.activeTransfers.set(localId, {
        sessionId: localId,
        destStation: sourceStation,
        filename: '',
        totalSize: 0,
        direction: 'receive',
        phase: 'awaiting-offer',
        oseq: 0,
        chunks: [],
        recvList: new Set(),
        outOfOrder: new Map(),
        expectedSeq: 0,
        receivedBytes: 0,
      })
    })
  }

  setOnProgress(cb: FileTransferProgressCallback): void {
    this.onProgress = cb
  }

  setOnOffer(cb: FileOfferCallback): void {
    this.onOffer = cb
  }

  async handleIncoming(frame: DDT2Frame): Promise<void> {
    const { sessionId, type, seq } = frame.header
    const state = this.activeTransfers.get(sessionId)
    if (!state) return

    if (type === STATEFUL_TYPE_DAT) {
      state.recvList.add(seq)

      if (state.phase === 'awaiting-offer') {
        if (frame.data.byteLength < 4) return
        const view = new DataView(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
        state.totalSize = view.getUint32(0, true)
        state.filename = new TextDecoder().decode(frame.data.slice(4))
        state.expectedSeq = (seq + 1) % 256
        state.phase = 'awaiting-accept'
        this.onOffer?.(state.filename, state.totalSize, sessionId, state.destStation)
        return
      }

      if (state.phase === 'awaiting-response') {
        this.pendingReplies.set(sessionId, new Uint8Array(frame.data))
        const waiter = this.dataWaiters.get(sessionId)
        if (waiter) {
          this.dataWaiters.delete(sessionId)
          waiter()
        }
        return
      }

      if (state.phase !== 'transferring') return
      this.deliverInOrder(state, seq, new Uint8Array(frame.data))
      return
    }

    if (type === STATEFUL_TYPE_ACK) {
      let acked = this.pendingAcked.get(sessionId)
      if (!acked) {
        acked = new Set()
        this.pendingAcked.set(sessionId, acked)
      }
      for (const s of frame.data) acked.add(s)

      const ackWaiter = this.ackWaiters.get(sessionId)
      if (ackWaiter) {
        this.ackWaiters.delete(sessionId)
        ackWaiter()
      }
      return
    }

    if (type === STATEFUL_TYPE_REQACK) {
      const requested = Array.from(frame.data)
      const toAck = requested.filter((s) => state.recvList.has(s))
      const ackFrame: DDT2Frame = {
        header: { ...frame.header, type: STATEFUL_TYPE_ACK, seq: 0, length: toAck.length },
        data: new Uint8Array(toAck),
      }
      await this.sessionManager.outgoing(ackFrame)
    }
  }

  private deliverInOrder(state: TransferState, seq: number, data: Uint8Array): void {
    if (seq !== state.expectedSeq) {
      state.outOfOrder.set(seq, data)
    } else {
      state.chunks.push(data)
      state.receivedBytes += data.byteLength
      state.expectedSeq = (state.expectedSeq + 1) % 256

      while (state.outOfOrder.has(state.expectedSeq)) {
        const next = state.outOfOrder.get(state.expectedSeq)!
        state.outOfOrder.delete(state.expectedSeq)
        state.chunks.push(next)
        state.receivedBytes += next.byteLength
        state.expectedSeq = (state.expectedSeq + 1) % 256
      }
    }

    this.onProgress?.(state.filename, Math.min(state.receivedBytes, state.totalSize), state.totalSize, state.sessionId)

    if (state.receivedBytes >= state.totalSize) {
      state.phase = 'complete'
      void this.sessionManager.endSession(state.sessionId)
    }
  }

  private nextSeq(state: TransferState): number {
    const seq = state.oseq
    state.oseq = (state.oseq + 1) % 256
    return seq
  }

  private async sendDataBlock(state: TransferState, seq: number, data: Uint8Array): Promise<void> {
    const frame: DDT2Frame = {
      header: {
        magic: 0xdd,
        seq,
        sessionId: state.sessionId,
        type: STATEFUL_TYPE_DAT,
        checksum: 0,
        length: data.length,
        sourceStation: this.sessionManager.getStation(),
        destStation: state.destStation,
      },
      data,
    }
    await this.sessionManager.outgoing(frame)
  }

  private async sendReqAck(state: TransferState, seqs: number[]): Promise<void> {
    const payload = new Uint8Array(seqs)
    const frame: DDT2Frame = {
      header: {
        magic: 0xdd,
        seq: 0,
        sessionId: state.sessionId,
        type: STATEFUL_TYPE_REQACK,
        checksum: 0,
        length: payload.length,
        sourceStation: this.sessionManager.getStation(),
        destStation: state.destStation,
      },
      data: payload,
    }
    await this.sessionManager.outgoing(frame)
  }

  private waitForAckSeqs(sessionId: number, timeoutMs: number): Promise<Set<number>> {
    const already = this.pendingAcked.get(sessionId)
    if (already && already.size > 0) {
      this.pendingAcked.delete(sessionId)
      return Promise.resolve(already)
    }

    return new Promise((resolve) => {
      this.ackWaiters.set(sessionId, () => {
        const acked = this.pendingAcked.get(sessionId) ?? new Set<number>()
        this.pendingAcked.delete(sessionId)
        resolve(acked)
      })
      setTimeout(() => {
        if (this.ackWaiters.has(sessionId)) {
          this.ackWaiters.delete(sessionId)
          resolve(new Set())
        }
      }, timeoutMs)
    })
  }

  private waitForData(sessionId: number, timeoutMs: number): Promise<Uint8Array | null> {
    const already = this.pendingReplies.get(sessionId)
    if (already) {
      this.pendingReplies.delete(sessionId)
      return Promise.resolve(already)
    }

    return new Promise((resolve) => {
      this.dataWaiters.set(sessionId, () => {
        const reply = this.pendingReplies.get(sessionId) ?? null
        this.pendingReplies.delete(sessionId)
        resolve(reply)
      })
      setTimeout(() => {
        if (this.dataWaiters.has(sessionId)) {
          this.dataWaiters.delete(sessionId)
          resolve(null)
        }
      }, timeoutMs)
    })
  }

  // Sends `chunks` as sequence-numbered data blocks in windows, requesting
  // and waiting for an ACK per window before advancing, retrying up to
  // FILE_MAX_RETRIES times. Mirrors the wire behavior of D-RATS's stateful
  // session (mod-256 block numbers, REQACK-driven ack, 4KB hard window cap)
  // without reproducing its adaptive-rate timeout heuristics exactly.
  private async sendReliable(state: TransferState, chunks: Uint8Array[]): Promise<void> {
    const blocks = chunks.map((data) => ({ seq: this.nextSeq(state), data }))
    const windowSize = Math.max(2, Math.min(FILE_WINDOW_SIZE, Math.floor(4096 / FILE_BLOCK_SIZE)))
    const acked = new Set<number>()
    let base = 0

    while (base < blocks.length) {
      const windowEnd = Math.min(base + windowSize, blocks.length)
      const window = blocks.slice(base, windowEnd)
      this.pendingAcked.delete(state.sessionId)

      for (const block of window) {
        await this.sendDataBlock(state, block.seq, block.data)
      }

      let attempt = 0
      for (;;) {
        const pending = window.filter((b) => !acked.has(b.seq))
        if (pending.length === 0) break

        if (attempt >= FILE_MAX_RETRIES) {
          throw new Error(`File transfer to ${state.destStation} failed: no ACK after ${FILE_MAX_RETRIES} retries`)
        }

        await this.sendReqAck(state, pending.map((b) => b.seq))
        const ackedNow = await this.waitForAckSeqs(state.sessionId, FILE_MIN_TIMEOUT_MS)
        for (const s of ackedNow) acked.add(s)
        attempt++
      }

      base = windowEnd
    }
  }

  async sendFile(
    filename: string,
    data: Uint8Array,
    dest: string,
    onSessionId?: (sessionId: number) => void,
  ): Promise<number> {
    const sessionId = await this.sessionManager.startSession(SESSION_TYPE_FILEXFER, dest, filename)
    onSessionId?.(sessionId)

    const state: TransferState = {
      sessionId,
      destStation: dest,
      filename,
      totalSize: data.byteLength,
      direction: 'send',
      phase: 'awaiting-response',
      oseq: 0,
      chunks: [],
      recvList: new Set(),
      outOfOrder: new Map(),
      expectedSeq: 0,
      receivedBytes: 0,
    }
    this.activeTransfers.set(sessionId, state)

    const filenameBytes = new TextEncoder().encode(filename)
    const offer = new Uint8Array(4 + filenameBytes.length)
    new DataView(offer.buffer).setUint32(0, data.byteLength, true)
    offer.set(filenameBytes, 4)

    await this.sendReliable(state, [offer])

    const response = await this.waitForData(sessionId, FILE_OFFER_RESPONSE_TIMEOUT_MS)
    if (!response) {
      state.phase = 'failed'
      this.activeTransfers.delete(sessionId)
      throw new Error(`File transfer to ${dest} failed: no response to offer (rejected or timed out)`)
    }

    const text = new TextDecoder().decode(response)
    let offset = 0
    if (text.startsWith('RESUME:')) {
      offset = parseInt(text.slice(7), 10) || 0
    } else if (text !== 'OK') {
      state.phase = 'failed'
      this.activeTransfers.delete(sessionId)
      throw new Error(`File transfer to ${dest} failed: unexpected response "${text}"`)
    }
    state.phase = 'transferring'

    const remaining = data.slice(offset)
    const chunks: Uint8Array[] = []
    for (let i = 0; i < remaining.length; i += FILE_BLOCK_SIZE) {
      chunks.push(remaining.slice(i, i + FILE_BLOCK_SIZE))
    }

    await this.sendReliable(state, chunks)

    state.phase = 'complete'
    this.onProgress?.(filename, data.byteLength, data.byteLength, sessionId)
    await this.sessionManager.endSession(sessionId)

    return sessionId
  }

  // Accepts a pending incoming offer and tells the sender to start streaming
  // data. Resuming a partial download isn't implemented (no persisted partial
  // state across sessions), so this always replies "OK".
  async acceptOffer(sessionId: number): Promise<void> {
    const state = this.activeTransfers.get(sessionId)
    if (!state || state.phase !== 'awaiting-accept') return

    state.phase = 'transferring'
    await this.sendReliable(state, [new TextEncoder().encode('OK')])
  }

  rejectFile(sessionId: number): void {
    const state = this.activeTransfers.get(sessionId)
    if (!state) return

    // Only stop the app-level exchange (no OK/RESUME reply is ever sent, so
    // the sender's wait for one will time out) — leave the transfer record
    // in place so the offer block's own transport-level ack, which the
    // sender is very likely still retrying for, keeps working regardless of
    // this rejection.
    state.phase = 'failed'
    void this.sessionManager.endSession(sessionId)
  }

  getTransfer(sessionId: number): TransferState | undefined {
    return this.activeTransfers.get(sessionId)
  }

  getCompletedData(sessionId: number): Uint8Array | null {
    const state = this.activeTransfers.get(sessionId)
    if (!state || state.phase !== 'complete') return null

    const result = new Uint8Array(state.receivedBytes)
    let offset = 0
    for (const chunk of state.chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  }
}
