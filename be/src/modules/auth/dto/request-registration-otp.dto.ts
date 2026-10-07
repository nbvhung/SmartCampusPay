import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RequestRegistrationOtpDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9]{5,20}$/, {
    message: 'Mã sinh viên không hợp lệ',
  })
  studentCode: string;

  @Transform(trim)
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải có 10 chữ số và bắt đầu bằng 0',
  })
  phone: string;
}
