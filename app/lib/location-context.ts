export const ACTIVE_LOCATION_STORAGE_KEY = "mytitan_active_location_id_v1";
export const ACTIVE_LOCATION_EVENT = "mytitan:active-location-changed";

function normalizeLocationId(value?: string | null) {
  const next = String(value || "").trim();
  return next && next !== "null" ? next : "all";
}

export function readActiveLocationId() {
  if (typeof window === "undefined") return "all";
  return normalizeLocationId(window.localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY));
}

export function hasStoredActiveLocationId() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY) !== null;
}

export function writeActiveLocationId(value?: string | null) {
  if (typeof window === "undefined") return "all";
  const next = normalizeLocationId(value);
  window.localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(ACTIVE_LOCATION_EVENT, { detail: { activeLocationId: next } }));
  return next;
}

export function subscribeActiveLocationId(callback: (activeLocationId: string) => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<{ activeLocationId?: string }>;
    callback(normalizeLocationId(customEvent.detail?.activeLocationId));
  };
  window.addEventListener(ACTIVE_LOCATION_EVENT, listener as EventListener);
  return () => window.removeEventListener(ACTIVE_LOCATION_EVENT, listener as EventListener);
}
