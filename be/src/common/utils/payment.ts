import { BadRequestException } from '@nestjs/common';

export function campusDate(now = new Date()): string {
  // UTC+7 has no daylight saving time.
  return new Date(now.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function normalizeUid(uid: string): string {
  const value = uid.trim().toUpperCase();
  // Keep seeded MOCK-* identifiers usable in development.
  if (/^MOCK-[A-Z0-9-]{1,45}$/.test(value)) return value;
  const hex = value.replace(/[\s:-]/g, '');
  if (!/^(?:[0-9A-F]{2}){2,10}$/.test(hex)) {
    throw new BadRequestException({
      code: 'INVALID_CARD_UID',
      message: 'Invalid card UID',
    });
  }
  return hex;
}

export function validateTopupAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 5000000) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Số tiền nguyên từ 1.000đ đến 5.000.000đ',
    });
  }
}
