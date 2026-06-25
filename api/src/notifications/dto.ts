import { IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  jobComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}

export class MarkNotificationReadDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

export class MarkAllNotificationsReadDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

export class DispatchSummaryEmailsDto {
  @IsIn(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])
  cadence!: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsISO8601()
  asOf?: string;
}

export const SUPPORT_REQUEST_CATEGORIES = [
  'support',
  'billing',
  'integrations',
  'bug_report',
  'feature_request',
  'onboarding',
] as const;

export class SubmitWorkspaceSupportRequestDto {
  @IsIn(SUPPORT_REQUEST_CATEGORIES)
  category!: (typeof SUPPORT_REQUEST_CATEGORIES)[number];

  @IsString()
  @MinLength(4)
  @MaxLength(140)
  subject!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsEmail()
  callbackEmail?: string;
}

export class SubmitPublicSupportRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsIn(SUPPORT_REQUEST_CATEGORIES)
  category!: (typeof SUPPORT_REQUEST_CATEGORIES)[number];

  @IsString()
  @MinLength(4)
  @MaxLength(140)
  subject!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(4000)
  message!: string;
}
