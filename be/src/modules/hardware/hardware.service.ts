import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ICardReader, CardReadResult } from './interfaces/icard-reader.interface';
import { MockCardReader } from './mock/mock-card-reader';

@Injectable()
export class HardwareService implements OnModuleInit {
  private readonly logger = new Logger(HardwareService.name);
  private reader: ICardReader;

  constructor() {
    this.reader = new MockCardReader();
  }

  async onModuleInit() {
    await this.reader.connect();
  }

  setReader(reader: ICardReader): void {
    this.reader = reader;
    this.logger.log(`Reader set to: ${reader.name}`);
  }

  async readCard(): Promise<CardReadResult | null> {
    return this.reader.readCard(5000);
  }

  async writeCard(uid: string, data: Record<string, any>): Promise<boolean> {
    return this.reader.writeData(uid, data);
  }

  getReaderInfo(): { name: string; connected: boolean } {
    return { name: this.reader.name, connected: this.reader.isConnected() };
  }
}
