export const DEFAULT_WORKSPACE_CURRENCY = 'GBP';
export const DEFAULT_WORKSPACE_LOCALE = 'en-GB';
export const DEFAULT_WORKSPACE_TIMEZONE = 'Europe/London';

export type GeoDefaults = {
  source: 'header' | 'fallback';
  detected: boolean;
  confidence: 'high' | 'fallback';
  countryCode: string | null;
  country: string | null;
  region: string | null;
  currency: string;
  locale: string;
  timezone: string;
};

export type RegionOption = {
  countryCode: string;
  label: string;
  currency: string;
  locale: string;
  timezone: string;
};

export const REGION_OPTIONS: RegionOption[] = [
  { countryCode: 'GB', label: 'United Kingdom', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' },
  { countryCode: 'IE', label: 'Ireland', currency: 'EUR', locale: 'en-IE', timezone: 'Europe/Dublin' },
  { countryCode: 'US', label: 'United States', currency: 'USD', locale: 'en-US', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  { countryCode: 'CA', label: 'Canada', currency: 'CAD', locale: 'en-CA', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  { countryCode: 'AU', label: 'Australia', currency: 'AUD', locale: 'en-AU', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  { countryCode: 'NZ', label: 'New Zealand', currency: 'NZD', locale: 'en-NZ', timezone: 'Pacific/Auckland' },
  { countryCode: 'DE', label: 'Germany', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' },
  { countryCode: 'FR', label: 'France', currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  { countryCode: 'ES', label: 'Spain', currency: 'EUR', locale: 'es-ES', timezone: 'Europe/Madrid' },
  { countryCode: 'IT', label: 'Italy', currency: 'EUR', locale: 'it-IT', timezone: 'Europe/Rome' },
  { countryCode: 'NL', label: 'Netherlands', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
  { countryCode: 'BE', label: 'Belgium', currency: 'EUR', locale: 'nl-BE', timezone: 'Europe/Brussels' },
  { countryCode: 'SE', label: 'Sweden', currency: 'SEK', locale: 'sv-SE', timezone: 'Europe/Stockholm' },
  { countryCode: 'NO', label: 'Norway', currency: 'NOK', locale: 'nb-NO', timezone: 'Europe/Oslo' },
  { countryCode: 'DK', label: 'Denmark', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
];

export function buildFallbackGeoDefaults(): GeoDefaults {
  return {
    source: 'fallback',
    detected: false,
    confidence: 'fallback',
    countryCode: null,
    country: null,
    region: null,
    currency: DEFAULT_WORKSPACE_CURRENCY,
    locale: DEFAULT_WORKSPACE_LOCALE,
    timezone: DEFAULT_WORKSPACE_TIMEZONE,
  };
}

export function findRegionOption(countryCode?: string | null) {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!normalized) return null;
  return REGION_OPTIONS.find((option) => option.countryCode === normalized) || null;
}

export function findRegionOptionByLocale(locale?: string | null) {
  const normalized = String(locale || '').trim().toLowerCase();
  if (!normalized) return null;
  return REGION_OPTIONS.find((option) => option.locale.toLowerCase() === normalized) || null;
}

export async function fetchGeoDefaults() {
  try {
    const response = await fetch('/api/auth/geo-defaults', { credentials: 'include' });
    if (!response.ok) {
      return buildFallbackGeoDefaults();
    }
    const body = await response.json();
    return {
      ...buildFallbackGeoDefaults(),
      ...(body || {}),
      currency: String(body?.currency || DEFAULT_WORKSPACE_CURRENCY).toUpperCase(),
      locale: String(body?.locale || DEFAULT_WORKSPACE_LOCALE),
      timezone: String(body?.timezone || DEFAULT_WORKSPACE_TIMEZONE),
      countryCode: body?.countryCode ? String(body.countryCode).toUpperCase() : null,
    } as GeoDefaults;
  } catch {
    return buildFallbackGeoDefaults();
  }
}
