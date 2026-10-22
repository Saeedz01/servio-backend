import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListThreadsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
