import type { DDT2Frame } from '../types'
import { SessionManager } from './session-mgr'

export const FILE_BLOCK_SIZE = 1024
export const FILE_WINDOW_SIZE = 8
export const FILE_MAX_RETRIES = 10
export const FILE_MIN_TIMEOUT_MS = 12000

export type FileTransferProgressCallback = (filename: string, transferred: number, total: number) => void
export type FileOfferCallback = (filename: string, size: number, sessionId: number) => void

interface TransferState {
  sessionId: number
  filename: string
  totalSize: number
  data: Uint8Array
  blocks: Map<number, Uint8Array>
  acked: Set<number>
  direction: 'send' | 'receive'
  retries: number
  completed: boolean
  resumeOffset: number
}

export class FileTransferEngine {
  private sessionManager: SessionManager
  private activeTransfers = new Map<number, TransferState>()
  private onProgress: FileTransferProgressCallback | null = null
  private onOffer: FileOfferCallback | null = null

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  setOnProgress(cb: FileTransferProgressCallback): void {
    this.onProgress = cb
  }

  setOnOffer(cb: FileOfferCallback): void {
    this.onOffer = cb
  }

  async handleIncoming(frame: DDT2Frame): Promise<void> {
    const { sessionId, type } = frame.header

    if (type === 0 && frame.data.byteLength > 4) {
      const view = new DataView(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
      const size = view.getUint32(0, true)
      const filename = new TextDecoder().decode(frame.data.slice(4))

      const state: TransferState = {
        sessionId,
        filename,
        totalSize: size,
        data: new Uint8Array(0),
        blocks: new Map(),
        acked: new Set(),
        direction: 'receive',
        retries: 0,
        completed: false,
        resumeOffset: 0,
      }
      this.activeTransfers.set(sessionId, state)
      this.onOffer?.(filename, size, sessionId)
      return
    }

    const state = this.activeTransfers.get(sessionId)
    if (!state) return

    if (type === 1) {
      if (frame.data.byteLength >= 2) {
        const view = new DataView(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
        const blockNum = view.getUint16(0, false)
        state.acked.add(blockNum)
        const transferred = state.acked.size * FILE_BLOCK_SIZE
        this.onProgress?.(state.filename, Math.min(transferred, state.totalSize), state.totalSize)
      }
      return
    }

    if (type === 2) {
      const blockNum = frame.header.seq
      state.blocks.set(blockNum, new Uint8Array(frame.data))
      const transferred = state.blocks.size * FILE_BLOCK_SIZE

      const ackData = new Uint8Array(2)
      new DataView(ackData.buffer).setUint16(0, blockNum, false)
      const ackFrame: DDT2Frame = {
        header: { ...frame.header, type: 1, length: 2 },
        data: ackData,
      }
      await this.sessionManager.outgoing(ackFrame)

      if (state.blocks.size * FILE_BLOCK_SIZE >= state.totalSize) {
        const allData = new Uint8Array(state.totalSize)
        let offset = 0
        for (let i = 0; i < Math.ceil(state.totalSize / FILE_BLOCK_SIZE); i++) {
          const block = state.blocks.get(i)
          if (block) {
            allData.set(block, offset)
          }
          offset += FILE_BLOCK_SIZE
        }
        state.data = allData
        state.completed = true
        this.onProgress?.(state.filename, state.totalSize, state.totalSize)
      }

      this.onProgress?.(state.filename, transferred, state.totalSize)
      return
    }
  }

  async sendFile(filename: string, data: Uint8Array, dest: string): Promise<number> {
    const sessionId = this.sessionManager.generateSessionId()
    const totalSize = data.byteLength

    const textEncoder = new TextEncoder()
    const filenameBytes = textEncoder.encode(filename)
    const offerData = new Uint8Array(4 + filenameBytes.length)
    new DataView(offerData.buffer).setUint32(0, totalSize, true)
    offerData.set(filenameBytes, 4)

    const state: TransferState = {
      sessionId,
      filename,
      totalSize,
      data,
      blocks: new Map(),
      acked: new Set(),
      direction: 'send',
      retries: 0,
      completed: false,
      resumeOffset: 0,
    }
    this.activeTransfers.set(sessionId, state)

    const offerFrame: DDT2Frame = {
      header: {
        magic: 0xdd,
        seq: 0,
        sessionId,
        type: 0,
        checksum: 0,
        length: offerData.length,
        sourceStation: this.sessionManager.getStation(),
        destStation: dest,
      },
      data: offerData,
    }
    await this.sessionManager.outgoing(offerFrame)

    const numBlocks = Math.ceil(totalSize / FILE_BLOCK_SIZE)

    for (let blockNum = 0; blockNum < numBlocks; blockNum += FILE_WINDOW_SIZE) {
      const windowEnd = Math.min(blockNum + FILE_WINDOW_SIZE, numBlocks)

      for (let i = blockNum; i < windowEnd; i++) {
        const start = i * FILE_BLOCK_SIZE
        const end = Math.min(start + FILE_BLOCK_SIZE, totalSize)
        const blockData = data.slice(start, end)

        const blockFrame: DDT2Frame = {
          header: {
            magic: 0xdd,
            seq: i,
            sessionId,
            type: 2,
            checksum: 0,
            length: blockData.length,
            sourceStation: this.sessionManager.getStation(),
            destStation: dest,
          },
          data: blockData,
        }
        await this.sessionManager.outgoing(blockFrame)
      }
    }

    return sessionId
  }

  rejectFile(sessionId: number): void {
    this.activeTransfers.delete(sessionId)
  }

  getTransfer(sessionId: number): TransferState | undefined {
    return this.activeTransfers.get(sessionId)
  }
}
