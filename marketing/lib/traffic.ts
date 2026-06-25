function getApiBase() {
  const explicit = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (explicit) return explicit;
  if (typeof window !== "undefined") return "/api";
  return "";
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  const key = "mytitan_anon_session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

export function recordMarketingVisit(path: string) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    path,
    surface: "marketing",
    source: "marketing",
    sessionId: getSessionId(),
  });
  const url = `${getApiBase()}/analytics/traffic`;
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
