import { ApiError, apiFetch, clearToken } from "./api";

type ResolvePostAuthDestinationOptions = {
  startHereEnabled: boolean;
};

const START_HERE_SEEN_KEY = "mytitan_start_here_seen_v1";

export function markStartHereSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(START_HERE_SEEN_KEY, "1");
}

export async function resolvePostAuthDestination(options: ResolvePostAuthDestinationOptions) {
  const me = await apiFetch("/me");
  if (me?.platformAdmin) {
    return "/platform";
  }
  const role = String(me?.role || "").toUpperCase();
  const status = await apiFetch("/onboarding/status");
  if (status?.onboardingCompleted === false) {
    return "/onboarding";
  }
  if (role === "TECHNICIAN") {
    return "/dashboard/technician";
  }
  if (role === "FINANCE") {
    return "/dashboard/finance";
  }
  if (options.startHereEnabled && typeof window !== "undefined") {
    const seen = window.localStorage.getItem(START_HERE_SEEN_KEY) === "1";
    if (!seen) {
      return "/start";
    }
  }
  return "/dashboard";
}

export function handleExpiredSession(error: unknown) {
  if (!(error instanceof ApiError) || error.statusCode !== 401) {
    return false;
  }
  clearToken();
  return true;
}
