import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class VerifyRegistrationOtpDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,128}$/, {
    message: 'Mã đăng ký không hợp lệ',
  })
  registrationId: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP phải gồm 6 chữ số' })
  otp: string;
}
