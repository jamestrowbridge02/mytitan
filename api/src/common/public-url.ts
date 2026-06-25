const DEFAULT_APP_PUBLIC_URL = 'https://app.mytitan.co.uk';
const DEFAULT_API_PUBLIC_URL = 'https://api.mytitan.co.uk';

function normalizeBaseUrl(value: string | null | undefined, fallback: string) {
  const normalized = String(value || '').trim();
  return (normalized || fallback).replace(/\/+$/, '');
}

function normalizePath(path: string) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function getAppPublicUrl() {
  return normalizeBaseUrl(process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_BASE_URL, DEFAULT_APP_PUBLIC_URL);
}

export function getApiPublicUrl() {
  return normalizeBaseUrl(process.env.API_PUBLIC_URL, DEFAULT_API_PUBLIC_URL);
}

export function buildAppUrl(path: string) {
  return `${getAppPublicUrl()}${normalizePath(path)}`;
}

export function buildApiUrl(path: string) {
  return `${getApiPublicUrl()}${normalizePath(path)}`;
}

export function resolvePublicUrl(value: string | null | undefined, options?: { kind?: 'app' | 'api' }) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (!normalized.startsWith('/')) return normalized;
  const base = options?.kind === 'api' ? getApiPublicUrl() : getAppPublicUrl();
  return `${base}${normalized}`;
}
