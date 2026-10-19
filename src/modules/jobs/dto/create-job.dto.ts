import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  /** When the seeker needs the work done. */
  @IsDateString()
  requestedAt!: string;

  /** Required for guests; ignored when a seeker JWT is present. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  guestName?: string;

  /** Required for guests; ignored when a seeker JWT is present. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  guestPhone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;

  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}
