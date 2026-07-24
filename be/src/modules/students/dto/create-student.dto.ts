import { IsString, IsEmail, IsOptional, IsDateString } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  studentCode: string;

  @IsString()
  fullName: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ (YYYY-MM-DD)' })
  dateOfBirth?: string;
}
