import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBiddingDto {
  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
