import {
  IsString,
  IsNumber,
  Min,
  Max,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayDto {
  @ApiProperty({ description: 'Mã sinh viên', example: 'B23DCCN358' })
  @IsString()
  studentCode: string;

  @ApiProperty({ description: 'ID điểm thanh toán (được ghi đè bởi X-API-Key)' })
  @IsUUID()
  merchantId: string;

  @ApiProperty({ description: 'Số tiền (VND)', example: 25000 })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  amount: number;

  @ApiProperty({
    description: 'UUID chống trùng giao dịch',
    example: '3c9b1e2a-aaaa-bbbb-cccc-dddddddddddd',
  })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional({ description: 'Mô tả giao dịch' })
  @IsOptional()
  @IsString()
  description?: string;
}
