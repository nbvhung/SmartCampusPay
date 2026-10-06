import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  studentCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cardUid: string;
}
