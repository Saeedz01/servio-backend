import { ContactUnlockTargetType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class UnlockContactDto {
  @IsEnum(ContactUnlockTargetType)
  targetType!: ContactUnlockTargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}
