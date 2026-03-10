import { getApiBase } from "./api";

export function isCommandCentreRealtimeDisabled() {
  return String(process.env.NEXT_PUBLIC_MYTITAN_DISABLE_SSE || "").trim() === "1";
}

export function getCommandCentreSseUrl() {
  return `${getApiBase()}/events/command-centre`;
}

export function getCommandCentreRealtimeMode() {
  return isCommandCentreRealtimeDisabled() ? "fallback" : "live";
}
