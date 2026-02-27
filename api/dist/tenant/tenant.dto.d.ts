import { WHEEL_PRICING_MODES } from '../common/constants';
export declare class UpdateTenantSettingsDto {
    companyName?: string;
    logoUrl?: string;
    brandPrimaryColor?: string;
    brandSecondaryColor?: string;
    brandAccentColor?: string;
    brandDefaultMode?: 'light' | 'dark';
    themeMode?: 'light' | 'dark';
    emailSenderName?: string;
    emailReplyTo?: string;
    emailNotificationRecipients?: string[];
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPasswordEncrypted?: string;
    whatsappTemplateDefault?: string;
    supportPhone?: string;
    vatEnabledDefault?: boolean;
    vatRateBpsDefault?: number;
    defaultTorqueSetting?: string;
    defaultTyrePressure?: string;
    defaultCurrency?: string;
    defaultLocale?: string;
    defaultTimezone?: string;
    defaultItems?: Array<{
        name: string;
        unitPrice: number;
        defaultQty: number;
    }>;
    defaultServiceNamePresets?: string[];
    defaultWheelPricingMode?: (typeof WHEEL_PRICING_MODES)[number];
    bookingsEnabled?: boolean;
    accountingEnabled?: boolean;
    paymentsEnabled?: boolean;
    socialEnabled?: boolean;
    aiEnabled?: boolean;
    onboardingStep?: number;
    onboardingCompleted?: boolean;
    featurePayments?: boolean;
    featureAccounting?: boolean;
    featureBookings?: boolean;
    featureSocial?: boolean;
    featureAI?: boolean;
    featureCustomerPortal?: boolean;
    featureWhatsApp?: boolean;
    bookingPublicEnabled?: boolean;
    aiRequestsLimit?: number;
}
export declare class SetLogoUrlDto {
    logoUrl?: string;
}
