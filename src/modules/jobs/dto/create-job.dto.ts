import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
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

  /** Required when category is Other Services. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  specialty?: string;

  /** When the seeker needs the work done. */
  @IsDateString()
  requestedAt!: string;

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
