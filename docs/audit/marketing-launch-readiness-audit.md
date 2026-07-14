# Marketing Launch Readiness Audit

Date: 2026-07-13

## Scope

Reviewed the marketing application under `marketing/`, including:

- home
- pricing
- platform
- solutions
- industries
- security
- contact
- demo
- privacy
- terms
- cookies
- data retention
- navigation, footer, mobile drawer, metadata, sitemap, robots, favicon/manifest, and public review surfaces

## Findings

### Critical Launch Blockers

None found in the reviewed source.

### High

None found in the reviewed source.

### Medium

- Production Core Web Vitals and external uptime evidence are not source artifacts. Existing copy avoids claiming them as complete. Operator evidence remains required before making performance or uptime claims beyond local checks.

### Low

- Home page product preview is explicitly labelled `Sample preview`, which is acceptable. Keep it labelled if screenshots are not live product captures.

### External / Legal Prerequisite

- Privacy, terms, cookies, data retention and governance pages are present and marked operator approved by E2E expectations, but final legal sign-off remains an operator/legal action outside source validation.

## Content Truth Review

Marketing copy avoids unsupported claims found risky for launch:

- No invented uptime percentage.
- No fake testimonial or customer-count claim.
- No claim of award-winning AI.
- No claim that customer money routes through MyTitan Billing Stripe.
- Extra job packs are described as not sold until Stripe products, webhook granting, and readiness checks are configured.
- Integrations are described as readiness-gated or tenant-owned setup, not universally live.
- Native app claims are avoided; install support is described as browser-dependent.

Reviewed specific surfaces:

- Xero / QuickBooks: readiness-gated setup language.
- Stripe: customer payments remain tenant-owned; MyTitan billing is separate.
- Calendar: controlled setup/export paths.
- Email: workspace-owned setup without credential exposure.
- Webhooks/API: described as available through controlled product surfaces.
- Security/trust: tenant boundaries, RBAC and audit history are stated as product controls, not external certifications.

## UX / Accessibility Review

Observed source patterns:

- Marketing drawer has focus trapping and Escape handling.
- Header and footer routes use real links.
- Pricing CTA routes to signup/pricing/bespoke account.
- Mobile drawer closes on navigation.
- Governance footer routes remain live.
- Product details use native `details/summary` where appropriate.

Focused E2E coverage:

- `app/e2e/marketing-pricing.spec.ts`
- `app/e2e/final-production-readiness.spec.ts`
- `app/e2e/launch-proof.spec.ts`

## Technical Readiness Review

Observed source artifacts:

- `marketing/public/robots.txt`
- `marketing/public/sitemap.xml`
- favicon and webmanifest assets
- `MarketingSeo` component for canonical/OG/Twitter metadata
- Dockerfile build path
- security headers checked in E2E

Validation required before rc16:

- `marketing npm run typecheck`
- `marketing npm run build`
- focused marketing E2E
- full isolated E2E
- live HTTP route evidence for marketing home, pricing, features/platform, integrations and security/trust

## Result

Marketing is suitable for launch candidate validation if the focused and full validation gates pass. Remaining items are operator/legal evidence, not source blockers.
