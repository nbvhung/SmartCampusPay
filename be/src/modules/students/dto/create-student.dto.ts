import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  faculty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  studentCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cardUid: string;
}
