import { IsString, MinLength, Matches, MaxLength } from 'class-validator';
import { STRONG_PASSWORD } from '../password-policy';

export class ChangePasswordDto {
  @IsString({ message: 'Mật khẩu cũ không hợp lệ' })
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu hiện tại' })
  oldPassword: string;

  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @MaxLength(72)
  @Matches(STRONG_PASSWORD, {
    message:
      'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt, không có khoảng trắng',
  })
  newPassword: string;
}
