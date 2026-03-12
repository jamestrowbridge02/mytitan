// Lightweight production brand reference for MyTitan logo usage.
// Clearspace: keep at least 0.5x the mark height around the lockup.
// On light surfaces prefer `mytitan-logo-light.svg`; on dark surfaces prefer `mytitan-logo-dark.svg`.
// Typography follows the Inter / ui-sans-serif / system-ui stack used across the app.
export const MYTITAN_BRAND = {
  primaryBlue: "#2563EB",
  accentBlue: "#38BDF8",
  enterpriseBlue: "#3B82F6",
  silver: "#64748B",
  graphite: "#0F172A",
  slate: "#64748B",
  logo: {
    mark: "/brand/mytitan-mark.svg",
    wordmark: "/brand/mytitan-wordmark.svg",
    light: "/brand/mytitan-logo-light.svg",
    dark: "/brand/mytitan-logo-dark.svg",
  },
} as const;
