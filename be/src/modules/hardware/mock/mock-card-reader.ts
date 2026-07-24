import { Injectable, Logger } from '@nestjs/common';
import { ICardReader, CardReadResult } from '../interfaces/icard-reader.interface';

const MOCK_CARDS: CardReadResult[] = [
  { uid: 'MOCK-UID-00001', chipType: 'MIFARE', rawData: 'hex:deadbeef0101', timestamp: new Date() },
  { uid: 'MOCK-UID-00002', chipType: 'MIFARE', rawData: 'hex:deadbeef0102', timestamp: new Date() },
  { uid: 'MOCK-UID-00003', chipType: 'MIFARE', rawData: 'hex:deadbeef0103', timestamp: new Date() },
];

@Injectable()
export class MockCardReader implements ICardReader {
  readonly name = 'MockCardReader';
  private connected = false;
  private readonly logger = new Logger(MockCardReader.name);
  private mockIndex = 0;

  async connect(): Promise<boolean> {
    this.connected = true;
    this.logger.log('Mock reader connected');
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.log('Mock reader disconnected');
  }

  async readCard(_timeoutMs?: number): Promise<CardReadResult | null> {
    if (!this.connected) {
      this.logger.warn('Reader not connected');
      return null;
    }
    const card = MOCK_CARDS[this.mockIndex % MOCK_CARDS.length];
    this.mockIndex++;
    this.logger.log(`Read mock card: ${card.uid}`);
    card.timestamp = new Date();
    return card;
  }

  async writeData(uid: string, data: Record<string, any>): Promise<boolean> {
    this.logger.log(`Writing data to ${uid}: ${JSON.stringify(data)}`);
    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
