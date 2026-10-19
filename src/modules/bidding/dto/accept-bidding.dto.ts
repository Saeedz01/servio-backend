import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Guest job owners must pass phone (+ optional name). JWT seekers omit these. */
export class AcceptBiddingDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
