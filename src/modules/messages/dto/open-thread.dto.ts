import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class OpenThreadDto {
  /** Preferred: open/create the thread for this booking. */
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  /** When opening without a booking (service inquiry). */
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  serviceTitle?: string;
}
