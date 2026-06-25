import { ApiError } from "./api";

export type WorkspaceFeatureKey =
  | "bookings_enabled"
  | "accounting_enabled"
  | "payments_enabled"
  | "social_enabled"
  | "ai_enabled";

type WorkspaceFeatureCopy = {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  matchers: string[];
};

const FEATURE_COPY: Record<WorkspaceFeatureKey, WorkspaceFeatureCopy> = {
  bookings_enabled: {
    title: "Bookings are ready to set up.",
    description: "Finish your booking settings to start taking bookings.",
    actionLabel: "Open booking settings",
    actionHref: "/dashboard/booking/settings",
    matchers: ["booking_enabled", "bookings_enabled", "booking", "bookings"],
  },
  accounting_enabled: {
    title: "Accounting is not turned on for this workspace yet.",
    description: "Ask a workspace admin to turn on accounting in Settings before using this area.",
    actionLabel: "Open settings",
    actionHref: "/dashboard/settings",
    matchers: ["accounting_enabled", "accounting"],
  },
  payments_enabled: {
    title: "Payments are not turned on for this workspace yet.",
    description: "Ask a workspace admin to turn on payments in Settings before using this area.",
    actionLabel: "Open settings",
    actionHref: "/dashboard/settings",
    matchers: ["payments_enabled", "payment", "payments"],
  },
  social_enabled: {
    title: "Social tools are not turned on for this workspace yet.",
    description: "Ask a workspace admin to turn on social tools in Settings before using this area.",
    actionLabel: "Open settings",
    actionHref: "/dashboard/settings",
    matchers: ["social_enabled", "social"],
  },
  ai_enabled: {
    title: "AI help is not turned on for this workspace yet.",
    description: "Ask a workspace admin to turn on AI help in Settings before using this area.",
    actionLabel: "Open settings",
    actionHref: "/dashboard/settings",
    matchers: ["ai_enabled", "ai assistant", "ai"],
  },
};

function normalizeMessage(message: string) {
  return message.trim().toLowerCase();
}

export function getFeatureUnavailableCopy(featureKey: WorkspaceFeatureKey) {
  return FEATURE_COPY[featureKey];
}

export function isFeatureUnavailableError(error: unknown, featureKey: WorkspaceFeatureKey) {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.statusCode !== 403 && error.statusCode !== 402) {
    return false;
  }

  const normalizedMessage = normalizeMessage(error.message || "");
  return FEATURE_COPY[featureKey].matchers.some((matcher) => normalizedMessage.includes(matcher));
}
