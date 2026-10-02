import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TopupClaimStatus } from '../topup-claim.entity';

const trimmed = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);

export class CreateTopupClaimDto {
  @trimmed() @IsString() @MinLength(2) @MaxLength(100) fullName: string;
  @trimmed() @IsString() @Matches(/^[A-Za-z0-9]{5,20}$/) studentCode: string;
  @trimmed() @IsString() @MinLength(1) @MaxLength(50) cardUid: string;
  @Type(() => Number) @IsInt() @Min(1000) @Max(5000000) amount: number;
  @IsDateString() transferredAt: string;
  @trimmed() @IsString() @MinLength(2) @MaxLength(100) senderName: string;
  @trimmed() @IsString() @MinLength(2) @MaxLength(100) bankName: string;
  @trimmed() @IsString() @MinLength(1) @MaxLength(100) bankReference: string;
  @trimmed() @IsString() @MinLength(5) @MaxLength(1000) description: string;
}

export class ListTopupClaimsDto {
  @IsOptional() @IsEnum(TopupClaimStatus) status?: TopupClaimStatus;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export class MatchTopupClaimDto {
  @IsUUID() pendingId: string;
  @trimmed() @IsString() @MinLength(5) @MaxLength(1000) note: string;
}

export class RejectTopupClaimDto {
  @trimmed() @IsString() @MinLength(5) @MaxLength(1000) reason: string;
}

export class ClaimCandidatesDto {
  @trimmed() @IsOptional() @IsString() @MaxLength(100) search?: string;
}
