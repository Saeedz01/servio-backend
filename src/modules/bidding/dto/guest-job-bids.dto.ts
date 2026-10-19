import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Guest job owner identity to list bids on a guest-posted job. */
export class GuestJobBidsDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
