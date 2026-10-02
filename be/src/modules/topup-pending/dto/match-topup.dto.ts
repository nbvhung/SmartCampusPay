import { IsEnum, IsOptional } from 'class-validator';
import { TopupPendingStatus } from '../topup-pending.entity';
export class ListTopupDto {
  @IsOptional() @IsEnum(TopupPendingStatus) status?: TopupPendingStatus;
}
