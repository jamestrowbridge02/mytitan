import { ApiError, getApiBase } from "./api";

const CUSTOMER_TOKEN_KEY = "mytitan_customer_token";

export function getCustomerToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function setCustomerToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

export function clearCustomerToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
}

export async function customerApiFetch(path: string, init: RequestInit = {}) {
  const token = getCustomerToken();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(init.headers ? (init.headers as Record<string, string>) : {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch {
    throw new Error("Cannot reach server. Please check your connection and try again.");
  }

  const requestId = response.headers.get("x-request-id") || undefined;
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
    const message = asJson?.message || text || response.statusText || "Request failed";
    throw new ApiError(
      Array.isArray(message) ? message.join(", ") : String(message),
      response.status,
      requestId,
      asJson ?? text,
    );
  }

  return asJson;
}
