export class ChatEngine {
  // TODO: implement chat session (stateless broadcast, ping/pong, status)
  sendMessage(text: string, dest?: string): void {
    throw new Error('Not implemented')
  }

  sendPing(): void {
    throw new Error('Not implemented')
  }

  sendStatus(status: number, message: string): void {
    throw new Error('Not implemented')
  }
}
