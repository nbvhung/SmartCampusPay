import { IsString, IsEmail, IsOptional, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStudentDto {
  @IsString()
  studentCode: string;

  @IsString()
  fullName: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  faculty?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ (YYYY-MM-DD)' })
  dateOfBirth?: string;
}
