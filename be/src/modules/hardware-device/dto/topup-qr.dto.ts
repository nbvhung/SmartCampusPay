import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class TopupQrDto {
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
