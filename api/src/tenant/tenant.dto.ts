import {
  IsObject,
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  Max,
  Min,
} from 'class-validator';
import { WHEEL_PRICING_MODES } from '../common/constants';

@ValidatorConstraint({ name: 'isBusinessLogoReference', async: false })
class IsBusinessLogoReferenceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (/^\/tenant\/public-logo\/[A-Za-z0-9._~%-]+(\/[A-Za-z0-9._~%-]+)?$/.test(trimmed) && !trimmed.includes('..')) {
      return true;
    }
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return 'logoUrl must be an HTTPS URL or a MyTitan public logo reference';
  }
}

export class UpdateTenantSettingsDto {
  // Primary trade (feature-flagged)
  @IsOptional()
  @IsString()
  primaryTrade?: string;
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  registeredBusinessName?: string;

  @IsOptional()
  @IsString()
  tradingName?: string;

  @IsOptional()
  @IsString()
  companyNumber?: string;

  @IsOptional()
  @IsString()
  taxRegistrationNumber?: string;

  @IsOptional()
  @IsString()
  businessAddressLine1?: string;

  @IsOptional()
  @IsString()
  businessAddressLine2?: string;

  @IsOptional()
  @IsString()
  businessCity?: string;

  @IsOptional()
  @IsString()
  businessPostcode?: string;

  @IsOptional()
  @IsString()
  businessCountry?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  websiteUrl?: string;

  @IsOptional()
  @IsObject()
  businessDisplayJson?: Record<string, any>;

  @IsOptional()
  @Validate(IsBusinessLogoReferenceConstraint)
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
  @IsIn(['light', 'dark', 'system'])
  themeMode?: 'light' | 'dark' | 'system';

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
  @IsString()
  tenantCountry?: string;

  @IsOptional()
  @IsString()
  invoiceCurrency?: string;

  @IsOptional()
  @IsString()
  publicBookingLocale?: string;

  @IsOptional()
  @IsString()
  phoneCountryCode?: string;

  @IsOptional()
  @IsString()
  taxLabel?: string;

  @IsOptional()
  @IsString()
  invoiceLegalFooter?: string;

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
  @IsObject()
  businessConfigJson?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  bookingPublicEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoConfirmPublicBookings?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiRequestsLimit?: number;
}

export class SetLogoUrlDto {
  @IsOptional()
  @Validate(IsBusinessLogoReferenceConstraint)
  logoUrl?: string;
}
