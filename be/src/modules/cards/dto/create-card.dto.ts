import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CardStatus } from '../card.entity';

export class CreateCardDto {
  @IsString() @MaxLength(50) uid: string;
  @IsUUID() studentId: string;
  @IsOptional() @IsString() @MaxLength(20) chipType?: string;
  @IsOptional() @IsEnum(CardStatus) status?: CardStatus;
}
export class UpdateCardStatusDto {
  @IsEnum(CardStatus) status: CardStatus;
}
