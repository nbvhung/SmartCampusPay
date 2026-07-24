import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class TopupDto {
  @IsString()
  studentCode: string;

  @IsNumber()
  @Min(10000)
  @Max(5000000)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
