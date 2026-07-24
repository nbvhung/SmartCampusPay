import { IsString, IsNumber, Min, Max, IsUUID, IsOptional } from 'class-validator';

export class PayDto {
  @IsString()
  studentCode: string;

  @IsUUID()
  merchantId: string;

  @IsNumber()
  @Min(100)
  @Max(10000000)
  amount: number;

  @IsString()
  idempotencyKey: string;

  @IsOptional()
  @IsString()
  description?: string;
}
