import type { Request } from 'express';

export const DEFAULT_WORKSPACE_CURRENCY = 'GBP';
export const DEFAULT_WORKSPACE_LOCALE = 'en-GB';
export const DEFAULT_WORKSPACE_TIMEZONE = 'Europe/London';

type GeoMapping = {
  countryCode: string;
  country: string;
  region: string;
  currency: string;
  locale: string;
  timezone: string;
};

const GEO_MAPPINGS: Record<string, GeoMapping> = {
  GB: { countryCode: 'GB', country: 'United Kingdom', region: 'United Kingdom', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' },
  IE: { countryCode: 'IE', country: 'Ireland', region: 'Ireland', currency: 'EUR', locale: 'en-IE', timezone: 'Europe/Dublin' },
  US: { countryCode: 'US', country: 'United States', region: 'United States', currency: 'USD', locale: 'en-US', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  CA: { countryCode: 'CA', country: 'Canada', region: 'Canada', currency: 'CAD', locale: 'en-CA', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  AU: { countryCode: 'AU', country: 'Australia', region: 'Australia', currency: 'AUD', locale: 'en-AU', timezone: DEFAULT_WORKSPACE_TIMEZONE },
  NZ: { countryCode: 'NZ', country: 'New Zealand', region: 'New Zealand', currency: 'NZD', locale: 'en-NZ', timezone: 'Pacific/Auckland' },
  DE: { countryCode: 'DE', country: 'Germany', region: 'Germany', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' },
  FR: { countryCode: 'FR', country: 'France', region: 'France', currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  ES: { countryCode: 'ES', country: 'Spain', region: 'Spain', currency: 'EUR', locale: 'es-ES', timezone: 'Europe/Madrid' },
  IT: { countryCode: 'IT', country: 'Italy', region: 'Italy', currency: 'EUR', locale: 'it-IT', timezone: 'Europe/Rome' },
  NL: { countryCode: 'NL', country: 'Netherlands', region: 'Netherlands', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
  BE: { countryCode: 'BE', country: 'Belgium', region: 'Belgium', currency: 'EUR', locale: 'nl-BE', timezone: 'Europe/Brussels' },
  SE: { countryCode: 'SE', country: 'Sweden', region: 'Sweden', currency: 'SEK', locale: 'sv-SE', timezone: 'Europe/Stockholm' },
  NO: { countryCode: 'NO', country: 'Norway', region: 'Norway', currency: 'NOK', locale: 'nb-NO', timezone: 'Europe/Oslo' },
  DK: { countryCode: 'DK', country: 'Denmark', region: 'Denmark', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
};

function normalizeCountryCode(value: unknown) {
  const next = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(next)) return null;
  if (['XX', 'T1', 'A1', 'AP', 'ZZ'].includes(next)) return null;
  return next;
}

function readCountryCodeFromRequest(req: Request) {
  return normalizeCountryCode(
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    req.headers['cloudfront-viewer-country'] ||
    req.headers['x-country-code'] ||
    req.headers['x-appengine-country'] ||
    req.headers['fastly-client-country-code'],
  );
}

export function resolveGeoDefaultsFromCountryCode(countryCode: string | null | undefined) {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const mapped = normalizedCountryCode ? GEO_MAPPINGS[normalizedCountryCode] : null;
  if (mapped) {
    return {
      source: 'header' as const,
      detected: true,
      confidence: 'high' as const,
      countryCode: mapped.countryCode,
      country: mapped.country,
      region: mapped.region,
      currency: mapped.currency,
      locale: mapped.locale,
      timezone: mapped.timezone,
    };
  }
  return {
    source: 'fallback' as const,
    detected: false,
    confidence: 'fallback' as const,
    countryCode: null,
    country: null,
    region: null,
    currency: DEFAULT_WORKSPACE_CURRENCY,
    locale: DEFAULT_WORKSPACE_LOCALE,
    timezone: DEFAULT_WORKSPACE_TIMEZONE,
  };
}

export function resolveGeoDefaultsFromRequest(req: Request) {
  return resolveGeoDefaultsFromCountryCode(readCountryCodeFromRequest(req));
}
