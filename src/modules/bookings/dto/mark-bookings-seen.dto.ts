import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class MarkBookingsSeenDto {
  /** When omitted, all unseen accepted bookings for the provider are marked. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  bookingIds?: string[];
}
