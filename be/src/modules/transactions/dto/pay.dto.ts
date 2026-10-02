import {
  IsString,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayDto {
  @ApiProperty({ description: 'Mã sinh viên', example: 'B23DCCN358' })
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  studentCode: string;

  @ApiProperty({ description: 'Số tiền (VND)', example: 25000 })
  @IsInt()
  @Min(100)
  @Max(10000000)
  amount: number;

  @ApiProperty({
    description: 'UUID chống trùng giao dịch',
    example: '3c9b1e2a-aaaa-4bbb-8ccc-dddddddddddd',
  })
  @IsUUID('4')
  idempotencyKey: string;

  @ApiPropertyOptional({ description: 'Mô tả giao dịch' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
