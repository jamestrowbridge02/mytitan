import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from './api';

export type TenantSettings = {
  planId?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor?: string | null;
  brandDefaultMode: 'light' | 'dark';
  themeMode?: 'light' | 'dark';
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
    technicianPrompts?: {
      checklist?: string[] | null;
    } | null;
  } | null;
  bookingPublicEnabled?: boolean;
  bookingPublicToken?: string | null;
  bookingIcsToken?: string | null;
  aiRequestsLimit?: number | null;
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
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
  defaultTimezone: 'UTC',
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

  root.style.setProperty('--tenant-primary', merged.brandPrimaryColor || defaultSettings.brandPrimaryColor);
  root.style.setProperty('--tenant-secondary', merged.brandSecondaryColor || defaultSettings.brandSecondaryColor);
  root.style.setProperty('--tenant-accent', merged.brandAccentColor || merged.brandPrimaryColor || defaultSettings.brandPrimaryColor);
  root.style.setProperty('--tenant-mode', merged.brandDefaultMode || defaultSettings.brandDefaultMode);
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
