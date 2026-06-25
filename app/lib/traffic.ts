import { getApiBase, getToken } from "./api";

function getSessionId() {
  if (typeof window === "undefined") return "";
  const key = "mytitan_anon_session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

export function classifyVisitSurface(path: string) {
  if (path === "/login" || path === "/signup" || path === "/forgot-password" || path === "/reset-password") return "login";
  if (path.startsWith("/portal/booking/status/")) return "public_status";
  if (path.startsWith("/portal/booking/")) return "public_booking";
  if (path.startsWith("/portal/job/") || path.startsWith("/complete/job/")) return "public_status";
  if (path.startsWith("/customer")) return "customer_workspace";
  return "app";
}

export function recordTrafficVisit(path: string, source = "app") {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    path,
    surface: classifyVisitSurface(path),
    source,
    sessionId: getSessionId(),
  });
  const url = `${getApiBase()}/analytics/traffic`;
  const token = getToken();
  if (navigator.sendBeacon && !token) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}
