// Lightweight production brand reference for MyTitan logo usage.
// Clearspace: keep at least 0.5x the mark height around the lockup.
// On light surfaces prefer `mytitan-logo-light.svg`; on dark surfaces prefer `mytitan-logo-dark.svg`.
// Typography follows the existing IBM Plex Sans / Segoe UI stack used across the app.
export const MYTITAN_BRAND = {
  primaryBlue: "#0F2B61",
  accentBlue: "#55B7FF",
  enterpriseBlue: "#1D4ED8",
  silver: "#B8C7E0",
  graphite: "#0F172A",
  slate: "#64748B",
  logo: {
    mark: "/brand/mytitan-mark.svg",
    wordmark: "/brand/mytitan-wordmark.svg",
    light: "/brand/mytitan-logo-light.svg",
    dark: "/brand/mytitan-logo-dark.svg",
  },
} as const;
