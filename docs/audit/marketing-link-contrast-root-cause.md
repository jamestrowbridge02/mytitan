# Marketing Link Contrast Root Cause

Date: 2026-07-16

## Root Cause

The marketing shell used `a { color: inherit; }` and multiple historical component sections with hard-coded foreground colours. This made link contrast dependent on whichever surface happened to contain the link. Primary CTA gradients also lacked concrete `background-color` fallbacks, so computed-style audits treated light CTA text as white on a transparent or white background.

## Corrected Source

- `marketing/styles/tokens.css`: added semantic text, link, control, and dark-surface tokens.
- `marketing/styles/globals.css`: assigned explicit link colours for light surfaces, dark sections, footer links, drawer links, and CTA states.
- `marketing/components/layout/MarketingShell.tsx`: linked the public footer/navigation to real `/integrations` and `/accessibility` routes.
- `marketing/pages/integrations.tsx` and `marketing/pages/accessibility.tsx`: added live routes required by release verification.

## Representative Computed Contrast

| Component | Foreground | Background | Ratio | Required |
| --- | --- | --- | ---: | ---: |
| Header quiet action | `rgb(51, 65, 85)` | `rgb(248, 250, 252)` | 9.5:1+ | 4.5:1 |
| Primary CTA | `rgb(248, 251, 255)` | `rgb(29, 78, 216)` | 6.5:1+ | 4.5:1 |
| Footer link | `rgb(29, 78, 216)` | light footer surface | 6.0:1+ | 4.5:1 |
| Drawer link | `rgb(29, 78, 216)` | `rgb(248, 250, 252)` | 6.4:1+ | 4.5:1 |
| Dark-section link | `rgb(147, 197, 253)` | `rgb(7, 17, 31)` | 9.0:1+ | 4.5:1 |

Validation: the focused computed contrast spec passed across home, pricing, integrations, security, privacy, terms, cookies, accessibility, header, drawer, body links, and footer links.
