import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, Length, IsUUID } from 'class-validator';

export class PayByCardDto {
  @ApiProperty({
    description: 'UID thẻ NFC đọc từ thiết bị (hex, viết hoa, không dấu cách)',
    example: 'MOCK-B23DCCN358',
  })
  @IsString()
  @Length(4, 50)
  cardUid: string;

  @ApiProperty({
    description: 'Số tiền (VND)',
    example: 25000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsInt()
  @Min(100)
  @Max(10000000)
  amount: number;

  @ApiProperty({
    description: 'UUID sinh tại thiết bị — chống trùng khi retry',
    example: '3c9b1e2a-aaaa-4bbb-8ccc-dddddddddddd',
  })
  @IsUUID('4')
  idempotencyKey: string;
}
