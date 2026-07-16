# Dashboard Dark Surface Contrast Root Cause

Date: 2026-07-16

## Root Cause

The active Dashboard page uses `dashboard-premium-*` classes, while older `dashboard-home-*` contrast hardening still exists in `app/styles/globals.css`. The active header was relying on generic foreground variables such as `--mt-text-primary` and late CSS cascade rules instead of a dedicated dark-surface semantic contract.

`Business snapshot` was also present only as visually hidden text, so it did not satisfy the live readability requirement for sighted operators.

## Corrected Source

- `app/styles/tokens.css`: added semantic foreground, heading, link, control, and dark-surface tokens.
- `app/styles/globals.css`: bound Dashboard premium header, meta text, section headings, links, and location control to the semantic tokens.
- `app/pages/dashboard/index.tsx`: made `Business snapshot` visible.

## Representative Computed Contrast

| Component | Foreground | Background | Ratio | Required |
| --- | --- | --- | ---: | ---: |
| Dashboard title, dark | `rgb(248, 250, 252)` | `rgb(11, 18, 32)` | 17.0:1+ | 4.5:1 |
| Greeting, dark | `rgb(248, 250, 252)` | `rgb(11, 18, 32)` | 17.0:1+ | 3:1 |
| Business/date, dark | `rgb(219, 234, 254)` | `rgb(11, 18, 32)` | 13.0:1+ | 4.5:1 |
| Open analytics, dark | `rgb(147, 197, 253)` | `rgb(11, 18, 32)` | 9.0:1+ | 4.5:1 |
| Dashboard title, light | `rgb(15, 23, 42)` | light app surface | 12.0:1+ | 4.5:1 |

Validation: `product-wide-contrast.spec.ts` passed for Dashboard dark and light themes.
