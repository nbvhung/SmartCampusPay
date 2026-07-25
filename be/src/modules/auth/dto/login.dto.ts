import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Mã sinh viên không hợp lệ' })
  studentCode: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  password: string;
}

export class AdminLoginDto {
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  username: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  password: string;
}

export class UnifiedLoginDto {
  @IsString({ message: 'Tên đăng nhập/MSSV không hợp lệ' })
  identifier: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  password: string;
}
