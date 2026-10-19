import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminSignupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class SeekerSignupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ProviderSignupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** http(s) URL or data-URL from client upload */
  @IsString()
  @IsNotEmpty()
  idFrontUrl!: string;

  @IsString()
  @IsNotEmpty()
  idBackUrl!: string;
}
