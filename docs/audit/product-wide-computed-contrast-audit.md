# Product-Wide Computed Contrast Audit

Date: 2026-07-16

## Utility

Added `app/e2e/contrast-utils.ts`.

The utility:

- obtains rendered `color` and `background-color`;
- resolves transparent ancestor backgrounds;
- calculates WCAG contrast using relative luminance;
- applies normal and large-text thresholds;
- reports selector, route, foreground, background, ratio, required ratio, and text.

## Focused Routes Covered

- Tenant Dashboard: dark and light themes.
- Tenant Settings: representative headings, buttons, labels, muted text.
- Marketing home, pricing, integrations, security, privacy, terms, cookies, accessibility.
- Marketing header action, drawer links, body links, footer links.

## Result

Focused run:

```text
PLAYWRIGHT_SKIP_DOCKER_SEED=1 MYTITAN_RUNTIME_ENV=e2e npm run test:e2e:docker -- product-wide-contrast.spec.ts
4 passed
```

## Fixes Recorded

| Route | Component | Issue | Fix |
| --- | --- | --- | --- |
| `/dashboard` | Title/greeting/meta | Active premium header depended on generic text tokens | Bound to heading and dark-surface tokens |
| `/dashboard` | Business snapshot | Only visually hidden | Made visible and tested |
| `/dashboard` | Open analytics | Link inherited generic readable link inconsistently | Bound to semantic readable link |
| `/pricing` | Primary CTA | Gradient had no concrete computed background | Added `background-color` fallback |
| Marketing routes | Header/footer/drawer links | `color: inherit` depended on surface | Added surface-aware link tokens |
| Dark marketing sections | Links/buttons | Light text depended on local hard-coded CSS | Bound to dark-surface tokens |
