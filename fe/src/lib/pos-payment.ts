export interface PendingPayment {
  cardUid: string;
  amount: number;
  idempotencyKey: string;
  keyFingerprint: string;
}
export interface PaymentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const PAYMENT_STORAGE_KEY = 'smartcampuspay.pending-payment.v1';

export function readPendingPayment(storage: PaymentStorage): PendingPayment | null {
  const raw = storage.getItem(PAYMENT_STORAGE_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid stored payment');
  const saved = value as PendingPayment;
  if (typeof saved.cardUid !== 'string' || !saved.cardUid || !Number.isSafeInteger(saved.amount)
    || saved.amount < 100 || saved.amount > 10000000 || typeof saved.keyFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(saved.keyFingerprint) || typeof saved.idempotencyKey !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.idempotencyKey)) {
    throw new Error('Invalid stored payment');
  }
  return saved;
}

// Caller holds the browser Web Lock for the entire prepare/send/finish cycle.
export async function preparePayment(storage: PaymentStorage, apiKey: string, cardUid: string, amount: number): Promise<PendingPayment> {
  if (!apiKey.trim()) throw new Error('Missing device key');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey.trim()));
  const keyFingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const saved = readPendingPayment(storage);
  if (saved && saved.keyFingerprint !== keyFingerprint) throw new Error('Nhập đúng API key đã dùng cho giao dịch đang chờ xác minh.');
  if (!saved && (!cardUid.trim() || !Number.isSafeInteger(amount) || amount < 100 || amount > 10000000)) throw new Error('Invalid payment');
  const payment = saved ?? { cardUid: cardUid.trim().toUpperCase(), amount, idempotencyKey: crypto.randomUUID(), keyFingerprint };
  // A storage failure prevents the caller from sending an untracked debit.
  storage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(payment));
  return payment;
}

export function finishPayment(storage: PaymentStorage, idempotencyKey: string): void {
  const saved = readPendingPayment(storage);
  if (saved && saved.idempotencyKey !== idempotencyKey) throw new Error('Another payment is pending');
  storage.removeItem(PAYMENT_STORAGE_KEY);
}
