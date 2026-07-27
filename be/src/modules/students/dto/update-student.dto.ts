import { IsString, IsEmail, IsOptional, IsDateString, IsBoolean } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
