export function getApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return '';
}

const API_BASE = getApiBase();

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

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('mytitan_token');
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('mytitan_token', token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('mytitan_token');
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers ? (init.headers as Record<string, string>) : {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
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
    const message = asJson?.message || text || response.statusText || 'Request failed';
    throw new ApiError(
      Array.isArray(message) ? message.join(', ') : String(message),
      response.status,
      requestId,
      asJson ?? text,
    );
  }

  return asJson;
}
