import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class TopupQrDto {
  @ApiProperty({
    description: 'Số tiền nạp cố định (VND)',
    example: 50000,
    minimum: 1000,
    maximum: 5000000,
  })
  @IsInt()
  @Min(1000)
  @Max(5000000)
  amount: number;

  @ApiPropertyOptional({
    description: 'UID thẻ NFC (ưu tiên) — đọc từ thiết bị khi quẹt thẻ',
    example: 'MOCK-20210012',
  })
  @IsOptional()
  @IsString()
  @Length(4, 50)
  cardUid?: string;

  @ApiPropertyOptional({
    description: 'Mã sinh viên — dùng khi thiết bị không đọc được thẻ',
    example: '20210012',
  })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  studentCode?: string;
}
