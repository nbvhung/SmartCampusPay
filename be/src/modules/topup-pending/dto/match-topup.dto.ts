import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { TopupPendingStatus } from '../topup-pending.entity';
export class MatchTopupDto {
  @IsString() @Matches(/^[A-Za-z0-9]{5,20}$/) studentCode: string;
}
export class ListTopupDto {
  @IsOptional() @IsEnum(TopupPendingStatus) status?: TopupPendingStatus;
}
