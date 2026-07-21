import { RadioSerial, DDT2_SOB, DDT2_EOB } from './serial'

export class Transport {
  private serial: RadioSerial
  private buffer: Uint8Array[] = []
  private onFrame: ((data: Uint8Array) => void) | null = null
  private onGpsString: ((data: string) => void) | null = null

  constructor(serial: RadioSerial) {
    this.serial = serial
    this.serial.setOnFrame((data) => this.onSerialData(data))
  }

  setOnFrame(cb: (data: Uint8Array) => void): void {
    this.onFrame = cb
  }

  setOnGpsString(cb: (data: string) => void): void {
    this.onGpsString = cb
  }

  async send(data: Uint8Array): Promise<void> {
    // TODO: implement frame sending with warmup/delay
    throw new Error('Not implemented')
  }

  private onSerialData(data: Uint8Array): void {
    // TODO: implement DDT2 frame detection (SOB/EOB) and raw GPS string detection
    throw new Error('Not implemented')
  }
}
