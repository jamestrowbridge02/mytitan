export function getApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return '';
}

const API_BASE = getApiBase();

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

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const asJson = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })() : null;

  if (!response.ok) {
    const message = asJson?.message || text || response.statusText || 'Request failed';
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }

  return asJson;
}
