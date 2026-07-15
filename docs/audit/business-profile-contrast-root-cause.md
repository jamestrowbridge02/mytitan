# Business Profile Contrast Root Cause

## Root cause

The app had several late CSS layers. Some components inherited legacy blue and muted values on dark card backgrounds, especially helper text, tab text, chart labels, and preview surfaces. In dark mode this produced low-contrast combinations when component-specific rules were more specific than base semantic token rules.

## Corrected token approach

The visual pass adds late app-shell semantic variables:

- `--mt-readable-primary`
- `--mt-readable-secondary`
- `--mt-readable-muted`
- `--mt-readable-link`
- `--mt-chart-axis`
- `--mt-chart-line`
- `--mt-chart-point`

These are applied to Business Profile, Settings cards, Reports chart cards, labels, muted text, table cells, and shared app links.

## Representative contrast pairs

| Surface | Foreground | Background | Result |
| --- | --- | --- | --- |
| Dark card primary text | `#f8fafc` | `#0f172a` / `#111827` | AA pass |
| Dark card muted text | `#cbd5e1` | `#0f172a` / `#111827` | AA pass |
| Dark links | `#93c5fd` | `#0f172a` | AA pass |
| Light primary text | `#0f172a` | `#ffffff` | AA pass |
| Light muted text | `#475569` | `#ffffff` | AA pass |

Brand colours remain available as accents, but body copy uses semantic readable tokens.
