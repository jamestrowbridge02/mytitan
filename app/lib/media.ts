import { getApiBase } from "./api";

function sameOriginApiBase() {
  if (typeof window !== "undefined") return "/api";
  return getApiBase();
}

export function resolveMediaUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(?:data:|blob:)/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const apiBase = getApiBase();
      const parsedApiBase = apiBase.startsWith("http") ? new URL(apiBase) : null;
      if (parsedApiBase && parsed.origin === parsedApiBase.origin && parsed.pathname.startsWith("/tenant/")) {
        return `${sameOriginApiBase()}${parsed.pathname}${parsed.search}`;
      }
      if (/^api\.mytitan\.co\.uk$/i.test(parsed.hostname) && parsed.pathname.startsWith("/tenant/")) {
        return `${sameOriginApiBase()}${parsed.pathname}${parsed.search}`;
      }
      return raw;
    } catch {
      return "";
    }
  }

  if (raw.startsWith("/tenant/") || raw.startsWith("/artifacts/") || raw.startsWith("/public/")) {
    return `${sameOriginApiBase()}${raw}`;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}
