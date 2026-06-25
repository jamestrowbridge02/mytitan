# Marketing Phase 6B Premium Redesign Audit

Date: 2026-06-06

## Previous State

The existing site had valid product, pricing, governance, and contact routes, but the header was a conventional logo/nav/action row and did not match the requested left-menu, centred-logo, right-CTA structure.

Primary weaknesses:

- navigation and commercial actions competed for header space
- mobile navigation used an expanding panel rather than a focused left drawer
- homepage positioning focused on a narrow completion slogan instead of the complete field-service operating system
- product capabilities were spread across general cards without a strong operating narrative
- integration readiness was not prominent enough for commercial evaluation
- sitemap and robots files were absent
- visual hierarchy had accumulated several refinement layers and still read like a feature-card template

## Phase 6B Changes

Header:

- left menu trigger
- visually centred MyTitan logo
- persistent `Get Quote`, `Call Now`, and `Book Online` actions
- left-side modal drawer
- Platform, Solutions, Features, Pricing, Integrations, Resources, and Contact sections
- Escape close, focus trap, focus return, outside-click close, keyboard labels, and reduced-motion support
- verified phone environment support; without a verified number, `Call Now` uses the real support contact path

Homepage:

- exact field-service operating-system positioning
- one primary trial CTA and one trust-focused secondary CTA
- product-truth command-centre panel
- operational command centre
- booking and calendar
- job sheets and proof-of-work
- customer portal and payment follow-through
- inventory, suppliers, and media
- offline field workflow
- reporting and intelligence
- integration readiness
- security and tenant trust
- pricing clarity
- final commercial CTA

SEO and accessibility:

- canonical URL
- title and meta description
- OpenGraph and Twitter metadata
- accurate SoftwareApplication structured data
- `robots.txt`
- `sitemap.xml`
- semantic section headings
- visible focus states
- labelled drawer and controls
- mobile-safe 44px interaction targets
- reduced-motion behavior

## Claim Review

Removed or avoided:

- fake customers or logos
- fake awards or accreditation
- fake AI
- fake uptime or external-monitor readiness
- claims that gated integrations are live
- claims that MyTitan collects tenant customer money through MyTitan Stripe

Integration wording distinguishes tenant-owned setup, available connection surfaces, and readiness-gated providers.

## Conversion Paths

- `Get Quote` routes to the real contact flow with billing/commercial context.
- `Call Now` uses a configured public phone only when supplied; otherwise it routes to support contact.
- `Book Online` routes to the real onboarding contact flow.
- trial/signup, sign-in, pricing, security, platform, governance, and support paths remain live.

## Remaining Commercial Risk

- A public sales phone number is not published unless `NEXT_PUBLIC_SALES_PHONE` is explicitly configured.
- No customer logos, awards, quantified outcomes, or uptime claims are shown because verified evidence was not supplied.
- External uptime monitoring remains intentionally deferred and is not claimed on the marketing site.
