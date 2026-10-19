import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';

function toUpperEnum({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class UpdateBookingStatusDto {
  @Transform(toUpperEnum)
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
