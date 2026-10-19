import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Guest identity required when withdrawing without a seeker JWT. */
export class WithdrawBookingDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
