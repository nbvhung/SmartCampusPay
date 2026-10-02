import { IsInt, IsString, Length, Max, Min } from 'class-validator';
export class CreatePaymentDto {
  @IsInt() @Min(1000) @Max(5000000) amount: number;
}
export class CancelPaymentDto {
  @IsString() @Length(1, 32) referenceCode: string;
}
