import { useCallback, useEffect, useRef, useState } from "react";

export const OPERATIONAL_DATA_CHANGED_EVENT = "mytitan:operational-data-changed";

const DEFAULT_REFRESH_MS = 45_000;
const MIN_REFRESH_MS = 30_000;
const MAX_REFRESH_MS = 60_000;

function configuredRefreshMs() {
  const parsed = Number(process.env.NEXT_PUBLIC_MYTITAN_OPERATIONAL_REFRESH_MS || DEFAULT_REFRESH_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_MS;
  return Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, Math.trunc(parsed)));
}

export function announceOperationalDataChanged(path?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATIONAL_DATA_CHANGED_EVENT, { detail: { path: path || "" } }));
}

export function useOperationalRefresh(
  refresh: () => Promise<unknown> | unknown,
  options?: { enabled?: boolean; intervalMs?: number },
) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  refreshRef.current = refresh;

  const refreshNow = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;
    setIsRefreshing(true);
    const pending = Promise.resolve(refreshRef.current())
      .then((value) => {
        setLastUpdatedAt(new Date());
        return value;
      })
      .finally(() => {
        if (inFlightRef.current === pending) inFlightRef.current = null;
        setIsRefreshing(false);
      });
    inFlightRef.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    if (options?.enabled === false || typeof window === "undefined") return;
    const intervalMs = Math.max(
      MIN_REFRESH_MS,
      Math.min(MAX_REFRESH_MS, options?.intervalMs || configuredRefreshMs()),
    );
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refreshNow();
    };
    const onVisibility = () => {
      if (!document.hidden) void refreshNow();
    };
    const intervalId = window.setInterval(refreshVisible, intervalMs);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    window.addEventListener(OPERATIONAL_DATA_CHANGED_EVENT, refreshVisible);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      window.removeEventListener(OPERATIONAL_DATA_CHANGED_EVENT, refreshVisible);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [options?.enabled, options?.intervalMs, refreshNow]);

  return { refreshNow, lastUpdatedAt, isRefreshing };
}
