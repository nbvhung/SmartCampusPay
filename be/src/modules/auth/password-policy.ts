import { BadRequestException } from '@nestjs/common';

export const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,72}$/;
export function assertStrongPassword(value: string): void {
  if (!STRONG_PASSWORD.test(value) || Buffer.byteLength(value, 'utf8') > 72) {
    throw new BadRequestException(
      'Mật khẩu cần 8–72 ký tự, tối đa 72 byte, gồm chữ hoa, chữ thường, số và ký tự đặc biệt, không có khoảng trắng',
    );
  }
}
