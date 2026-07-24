export interface CardReadResult {
  uid: string;
  chipType: string;
  rawData?: string;
  parsedData?: Record<string, any>;
  timestamp: Date;
}

export interface ICardReader {
  readonly name: string;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  readCard(timeoutMs?: number): Promise<CardReadResult | null>;
  writeData(uid: string, data: Record<string, any>): Promise<boolean>;
  isConnected(): boolean;
}
