import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function normalizeEmailInput({ value }: { value: unknown }) {
  return String(value || '').trim().toLowerCase();
}

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
  @Transform(normalizeEmailInput)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  @Transform(normalizeEmailInput)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(normalizeEmailInput)
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
  @Transform(normalizeEmailInput)
  email?: string;
}

export class PlatformStaffSetupRequestDto {
  @IsEmail()
  @Transform(normalizeEmailInput)
  email!: string;
}

export class PlatformStaffSetupCompleteDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
