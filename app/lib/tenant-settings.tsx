import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from './api';
import { DEFAULT_WORKSPACE_CURRENCY, DEFAULT_WORKSPACE_LOCALE, DEFAULT_WORKSPACE_TIMEZONE } from './geo-defaults';

export type TenantSettings = {
  planId?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor?: string | null;
  brandDefaultMode: 'light' | 'dark';
  themeMode?: 'light' | 'dark' | 'system';
  emailSenderName?: string | null;
  emailReplyTo?: string | null;
  emailNotificationRecipients?: string[] | null;
  whatsappTemplateDefault?: string | null;
  supportPhone?: string | null;
  vatEnabledDefault: boolean;
  vatRateBpsDefault: number;
  defaultTorqueSetting?: string | null;
  defaultTyrePressure?: string | null;
  defaultCurrency: string;
  defaultLocale: string;
  defaultTimezone: string;
  defaultItems?: Array<{ name: string; unitPrice: number; defaultQty: number }> | null;
  defaultServiceNamePresets?: string[] | null;
  defaultWheelPricingMode?: 'PER_WHEEL' | 'SET' | null;
  bookingsEnabled: boolean;
  accountingEnabled: boolean;
  paymentsEnabled: boolean;
  socialEnabled: boolean;
  aiEnabled: boolean;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  guidedSetupCurrentStep?: number;
  guidedSetupCompletedSteps?: string[];
  guidedSetupSkippedSteps?: string[];
  guidedSetupCompletedAt?: string | null;
  activeJobSheetTemplateId?: string | null;
  activeJobSheetTemplateName?: string | null;
  activeJobSheetTemplateTrade?: string | null;
  activeJobSheetTemplateVersion?: number | null;
  primaryTrade?: 'WHEELS' | 'BODYSHOP' | 'GARAGE' | 'MOBILE' | null;
  featurePayments?: boolean;
  featureAccounting?: boolean;
  featureBookings?: boolean;
  featureSocial?: boolean;
  featureAI?: boolean;
  featureCustomerPortal?: boolean;
  featureWhatsApp?: boolean;
  businessConfigJson?: {
    workflowStages?: {
      bookings?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
      jobs?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
      technician?: Array<{ id: string; label?: string | null; statuses?: string[] | null; visible?: boolean | null; requiredCustomFieldKeys?: string[] | null; requiredFieldEnforcementMode?: "warn" | "block" | null }> | null;
    } | null;
    terminology?: {
      jobs?: string | null;
      bookings?: string | null;
      customers?: string | null;
      technicians?: string | null;
    } | null;
    workforceTerminology?: {
      singular?: string | null;
      plural?: string | null;
      defaultFieldWorkerLabel?: string | null;
      publicBookingLabel?: string | null;
    } | null;
    defaults?: {
      commandCentreVersion?: "v1" | "v2" | null;
    } | null;
    navigation?: {
      showIntelligence?: boolean;
      showPortalOps?: boolean;
      showTechnicianQueue?: boolean;
    } | null;
    portalCopy?: {
      invoiceReadyMessage?: string | null;
      invoiceOverdueMessage?: string | null;
      preInvoiceMessage?: string | null;
      paidMessage?: string | null;
      paymentUnavailableMessage?: string | null;
    } | null;
    analytics?: {
      widgetOrder?: Array<"executive-summary" | "pressure-panel" | "revenue-panel" | "capacity-panel" | "benchmark-delta" | "customer-commercial-signals"> | null;
      hiddenWidgets?: Array<"executive-summary" | "pressure-panel" | "revenue-panel" | "capacity-panel" | "benchmark-delta" | "customer-commercial-signals"> | null;
      defaultWindowDays?: number | null;
    } | null;
    commandCentre?: {
      sectionOrder?: Array<"filters" | "recent-updates" | "bulk-actions" | "work-board"> | null;
      hiddenSections?: Array<"filters" | "recent-updates" | "bulk-actions" | "work-board"> | null;
      defaultViewMode?: "kanban" | "list" | null;
    } | null;
    serviceRecordEmail?: {
      defaultRecipients?: string[] | null;
      includeJobCustomerEmail?: boolean | null;
      includeBusinessDetails?: boolean | null;
      includeContactDetails?: boolean | null;
      includeBillingDetails?: boolean | null;
      includePaymentSummary?: boolean | null;
      includeEvidenceSummary?: boolean | null;
      includeSignatureSummary?: boolean | null;
      includePortalLink?: boolean | null;
      includePdfLink?: boolean | null;
      signatureEnabled?: boolean | null;
      signatureText?: string | null;
    } | null;
    notificationRouting?: {
      internalRecipients?: Array<{
        email: string;
        label?: string | null;
        enabled?: boolean | null;
        categories?: Array<"bookings" | "payments" | "jobs" | "customer_messages" | "workspace_alerts"> | null;
      }> | null;
    } | null;
    summaryEmails?: {
      enabled?: boolean | null;
      enabledCadences?: Array<"daily" | "weekly" | "monthly" | "quarterly" | "annual"> | null;
      enabledSections?: Array<"bookings" | "jobs" | "payments" | "failed_sends" | "upcoming_work" | "tax_reminders"> | null;
      lastDispatchedAtByCadence?: Partial<Record<"daily" | "weekly" | "monthly" | "quarterly" | "annual", string>> | null;
    } | null;
    operationalAlerts?: {
      externalEmailRecipients?: string[] | null;
      enabledCategories?: Array<"failed_email" | "failed_summary_dispatch" | "failed_booking" | "failed_payment" | "failed_refund" | "failed_webhook" | "failed_backup" | "health_degraded"> | null;
    } | null;
    customerFeedback?: {
      enabled?: boolean | null;
      promptText?: string | null;
      publicReviewUrl?: string | null;
      thankYouText?: string | null;
    } | null;
    finance?: {
      vatNumber?: string | null;
      invoiceNumberPrefix?: string | null;
      paymentTermsDays?: number | null;
      defaultVatCategory?: string | null;
    } | null;
    jobForms?: {
      declarationText?: string | null;
      serviceTypes?: Array<{
        id: string;
        name: string;
        description?: string | null;
        enabled?: boolean | null;
        retired?: boolean | null;
        order?: number | null;
      }> | null;
      sections?: Array<{
        id: string;
        title: string;
        description?: string | null;
        order?: number | null;
        visible?: boolean | null;
        serviceTypeIds?: string[] | null;
      }> | null;
      fields?: Array<{
        id: string;
        key: string;
        sectionId: string;
        label: string;
        helpText?: string | null;
        type: "text" | "textarea" | "select" | "checkbox" | "number" | "date";
        required?: boolean | null;
        visible?: boolean | null;
        order?: number | null;
        options?: string[] | null;
        serviceTypeIds?: string[] | null;
      }> | null;
    } | null;
    technicianPrompts?: {
      checklist?: string[] | null;
    } | null;
  } | null;
  bookingPublicEnabled?: boolean;
  bookingPublicToken?: string | null;
  bookingIcsToken?: string | null;
  aiRequestsLimit?: number | null;
};

export type EmailReadiness = {
  status: 'ready' | 'safe_capture' | 'not_configured' | 'misconfigured' | 'failing';
  source: 'environment' | 'encrypted_vault' | 'safe_capture' | 'missing';
  transport: 'smtp' | 'capture' | 'none';
  canSend: boolean;
  fromEmail?: string | null;
  fromName?: string | null;
  replyToEmail?: string | null;
  deliveryReady?: boolean;
  deliveryPath?: 'custom_sender' | 'mytitan_service' | 'unavailable';
  fromAddressSource?: 'custom_verified_sender' | 'mytitan_system_sender' | 'none';
  replyTo?: string | null;
  replyToSource?: 'business_email' | 'mytitan_system_email' | 'none';
  customSenderConfigured?: boolean;
  customSenderVerified?: boolean;
  systemSenderReady?: boolean;
  effectiveSenderLabel?: string;
  operatorAction?: string;
  requestId?: string;
  guidance: string;
  dnsRecords: string[];
  senderOwnership?: 'workspace' | 'system' | 'none';
  usingFallback?: boolean;
  notice?: string | null;
  workspace?: EmailReadiness;
  fallback?: EmailReadiness;
  effective?: EmailReadiness;
};

type TenantSettingsContextValue = {
  settings: TenantSettings | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  setLocalSettings: (settings: TenantSettings) => void;
};

const TenantSettingsContext = createContext<TenantSettingsContextValue | undefined>(undefined);

const defaultSettings: TenantSettings = {
  planId: null,
  companyName: 'MyTitan Tenant',
  logoUrl: null,
  brandPrimaryColor: '#4fd1c5',
  brandSecondaryColor: '#1a1f36',
  brandAccentColor: '#4fd1c5',
  brandDefaultMode: 'dark',
  themeMode: 'light',
  supportPhone: null,
  vatEnabledDefault: false,
  vatRateBpsDefault: 0,
  defaultTorqueSetting: null,
  defaultTyrePressure: null,
  defaultCurrency: DEFAULT_WORKSPACE_CURRENCY,
  defaultLocale: DEFAULT_WORKSPACE_LOCALE,
  defaultTimezone: DEFAULT_WORKSPACE_TIMEZONE,
  bookingsEnabled: false,
  accountingEnabled: false,
  paymentsEnabled: false,
  socialEnabled: false,
  aiEnabled: false,
  onboardingCompleted: false,
  onboardingStep: 0,
  guidedSetupCurrentStep: 0,
  guidedSetupCompletedSteps: [],
  guidedSetupSkippedSteps: [],
  guidedSetupCompletedAt: null,
  primaryTrade: null,
  featurePayments: false,
  featureAccounting: false,
  featureBookings: false,
  featureSocial: false,
  featureAI: false,
  featureCustomerPortal: false,
  featureWhatsApp: false,
  businessConfigJson: null,
  bookingPublicEnabled: false,
  bookingPublicToken: null,
  bookingIcsToken: null,
  aiRequestsLimit: null,
};

function applyTheme(settings: TenantSettings | null) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const merged = settings || defaultSettings;
  const storedMode = typeof window !== 'undefined'
    ? window.localStorage.getItem('mytitan_theme_mode')
    : null;
  const configuredMode = merged.themeMode === 'dark' || merged.themeMode === 'system' || merged.themeMode === 'light'
    ? merged.themeMode
    : storedMode === 'dark' || storedMode === 'system'
      ? storedMode
      : 'light';
  const dark = configuredMode === 'dark'
    || (configuredMode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.style.setProperty('--tenant-primary', merged.brandPrimaryColor || defaultSettings.brandPrimaryColor);
  root.style.setProperty('--tenant-secondary', merged.brandSecondaryColor || defaultSettings.brandSecondaryColor);
  root.style.setProperty('--tenant-accent', merged.brandAccentColor || merged.brandPrimaryColor || defaultSettings.brandPrimaryColor);
  root.style.setProperty('--tenant-mode', merged.brandDefaultMode || defaultSettings.brandDefaultMode);
  root.classList.toggle('dark', dark);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themeMode = configuredMode;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('mytitan_theme_mode', configuredMode);
  }
}

export function TenantSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setSettings(null);
      setLoading(false);
      setError('');
      applyTheme(defaultSettings);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/tenant/settings');
      
      // TENANT_SETTINGS_UNAUTH: marker used for HTML sanity checks when settings cannot load.
const merged = { ...defaultSettings, ...(data || {}) } as TenantSettings;
      setSettings(merged);
      applyTheme(merged);
    } catch (err: any) {
      setError(err.message || 'Failed to load tenant settings');
      setSettings(defaultSettings);
      applyTheme(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    if (typeof window === 'undefined') return;

    const handleTokenChanged = () => {
      void refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'mytitan_token') {
        void refresh();
      }
    };

    window.addEventListener('mytitan:token-changed', handleTokenChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('mytitan:token-changed', handleTokenChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mode = settings?.themeMode;
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme(settings);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      refresh,
      setLocalSettings: (next: TenantSettings) => {
        const merged = { ...defaultSettings, ...next };
        setSettings(merged);
        applyTheme(merged);
      },
    }),
    [settings, loading, error],
  );

  return <TenantSettingsContext.Provider value={value}>{children}</TenantSettingsContext.Provider>;
}

export function useTenantSettings() {
  const context = useContext(TenantSettingsContext);
  if (!context) {
    throw new Error('useTenantSettings must be used inside TenantSettingsProvider');
  }
  return context;
}
