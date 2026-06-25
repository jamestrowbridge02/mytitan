import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @Length(2, 2)
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  defaultLocale?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ResendVerificationDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
