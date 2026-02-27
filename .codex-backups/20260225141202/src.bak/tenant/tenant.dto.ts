import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { WHEEL_PRICING_MODES } from '../common/constants';

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @IsOptional()
  @IsHexColor()
  brandPrimaryColor?: string;

  @IsOptional()
  @IsHexColor()
  brandSecondaryColor?: string;

  @IsOptional()
  @IsHexColor()
  brandAccentColor?: string;

  @IsOptional()
  @IsIn(['light', 'dark'])
  brandDefaultMode?: 'light' | 'dark';

  @IsOptional()
  @IsIn(['light', 'dark'])
  themeMode?: 'light' | 'dark';

  @IsOptional()
  @IsString()
  emailSenderName?: string;

  @IsOptional()
  @IsEmail()
  emailReplyTo?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  emailNotificationRecipients?: string[];

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUsername?: string;

  @IsOptional()
  @IsString()
  smtpPasswordEncrypted?: string;

  @IsOptional()
  @IsString()
  whatsappTemplateDefault?: string;

  @IsOptional()
  @IsString()
  supportPhone?: string;

  @IsOptional()
  @IsBoolean()
  vatEnabledDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  vatRateBpsDefault?: number;

  @IsOptional()
  @IsString()
  defaultTorqueSetting?: string;

  @IsOptional()
  @IsString()
  defaultTyrePressure?: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  defaultLocale?: string;

  @IsOptional()
  @IsString()
  defaultTimezone?: string;

  @IsOptional()
  @IsArray()
  defaultItems?: Array<{ name: string; unitPrice: number; defaultQty: number }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultServiceNamePresets?: string[];

  @IsOptional()
  @IsIn(WHEEL_PRICING_MODES)
  defaultWheelPricingMode?: (typeof WHEEL_PRICING_MODES)[number];

  @IsOptional()
  @IsBoolean()
  bookingsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  accountingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  socialEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  onboardingStep?: number;

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  featurePayments?: boolean;

  @IsOptional()
  @IsBoolean()
  featureAccounting?: boolean;

  @IsOptional()
  @IsBoolean()
  featureBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  featureSocial?: boolean;

  @IsOptional()
  @IsBoolean()
  featureAI?: boolean;

  @IsOptional()
  @IsBoolean()
  featureCustomerPortal?: boolean;

  @IsOptional()
  @IsBoolean()
  featureWhatsApp?: boolean;

  @IsOptional()
  @IsBoolean()
  bookingPublicEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiRequestsLimit?: number;
}

export class SetLogoUrlDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;
}
