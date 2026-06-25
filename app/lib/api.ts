export function getApiBase() {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  // Keep the localhost fallback limited to explicit local/server-side development.
  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:3000';
  return '';
}

export class ApiError extends Error {
  statusCode: number;
  requestId?: string;
  payload?: unknown;

  constructor(message: string, statusCode: number, requestId?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.payload = payload;
  }
}

const inFlightGets = new Map<string, Promise<any>>();

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('mytitan_token');
}

function notifyTokenChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('mytitan:token-changed'));
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('mytitan_token', token);
  notifyTokenChanged();
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('mytitan_token');
  notifyTokenChanged();
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const apiBase = getApiBase();
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers ? (init.headers as Record<string, string>) : {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const method = String(init.method || 'GET').toUpperCase();
  const dedupeKey = method === 'GET' && typeof window !== 'undefined' ? `${token || 'anonymous'}:${path}` : '';
  if (dedupeKey && inFlightGets.has(dedupeKey)) return inFlightGets.get(dedupeKey);

  const execute = async () => {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch {
    throw new Error('Cannot reach server. Please check your connection and try again.');
  }

  const requestId = response.headers.get('x-request-id') || undefined;
  const text = await response.text();
  const asJson = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    if (response.status === 413) {
      throw new ApiError(
        asJson?.message || 'This file is too large. Choose a smaller file and try again.',
        response.status,
        requestId,
        asJson ?? text,
      );
    }
    const message = asJson?.message || text || response.statusText || 'Request failed';
    throw new ApiError(
      Array.isArray(message) ? message.join(', ') : String(message),
      response.status,
      requestId,
      asJson ?? text,
    );
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mytitan:operational-data-changed', { detail: { path } }));
  }
  return asJson;
  };
  if (!dedupeKey) return execute();
  const pending = execute().finally(() => {
    if (inFlightGets.get(dedupeKey) === pending) inFlightGets.delete(dedupeKey);
  });
  inFlightGets.set(dedupeKey, pending);
  return pending;
}
