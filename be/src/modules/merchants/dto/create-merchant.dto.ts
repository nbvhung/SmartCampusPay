import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { MerchantType } from '../merchant.entity';

export class CreateMerchantDto {
  @IsString()
  name: string;

  @IsEnum(MerchantType)
  type: MerchantType;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
