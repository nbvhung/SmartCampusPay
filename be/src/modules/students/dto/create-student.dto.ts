import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  studentCode: string;

  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  faculty?: string;
}
