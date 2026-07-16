# Hard-Coded Text Colour Audit

Date: 2026-07-16

## Scan

Search covered app, marketing, shared styles, and page/component inline styles for hard-coded foreground colours, Tailwind-style text colour utilities, and inline colour styles.

## Classification

| Class | Examples | Decision |
| --- | --- | --- |
| Semantic token definitions | `app/styles/tokens.css`, `marketing/styles/tokens.css` | Approved |
| Brand and CTA surfaces | Marketing CTA gradients, logo assets | Approved when paired with computed contrast |
| Status colours | Success, warning, danger, readiness states | Approved when not the sole indicator |
| Data visualisation colours | Chart and series colours | Approved exception |
| Public portal legacy inline colours | Portal/payment pages | Existing surface-specific code; not the observed Dashboard/marketing root cause |
| Legacy inherited link text | Marketing shell/footer/drawer links | Replaced with semantic link tokens |
| Dark Dashboard heading/meta | Dashboard premium header | Replaced with semantic heading/dark-surface tokens |

## Result

The release fix did not attempt to remove every hard-coded colour because several are intentional status, chart, brand, or public-token colours. The root contrast failures were corrected by replacing inherited/hard-coded foreground use in shared Dashboard and marketing link surfaces with semantic tokens and computed contrast tests.
