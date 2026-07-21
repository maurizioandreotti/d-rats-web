export class FileTransferEngine {
  // TODO: implement stateful file transfer (offer, ACK/NAK, resume, progress)
  sendFile(filename: string, data: ArrayBuffer, dest: string): void {
    throw new Error('Not implemented')
  }

  acceptFile(id: string): void {
    throw new Error('Not implemented')
  }

  rejectFile(id: string): void {
    throw new Error('Not implemented')
  }
}
