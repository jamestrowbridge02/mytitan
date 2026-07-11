# Tenant Billing Experience Audit

Date: 2026-07-11

## Scope

Reviewed the tenant-facing MyTitan Account page at `app/pages/dashboard/billing.tsx`, the shared billing state hook at `app/lib/billing.tsx`, and the billing API actions in `api/src/billing/billing.controller.ts` and `api/src/billing/billing.service.ts`.

## Root Cause

The customer-facing account page was using safe billing primitives, but it composed them as an operator diagnostics dashboard. Tenant users saw repeated commercial state, Stripe catalog readiness language, job-pack enablement detail, webhook/canary wording, platform catalog links for platform admins, and setup-oriented explanations that belong in Platform Admin or operator logs.

## Removed From Tenant View

- Stripe catalog mapping status and subscription price review panels.
- Runtime/setup enablement instructions.
- Job-pack canary status.
- Webhook-backed granting copy.
- Product keys, internal product codes, and platform catalog links.
- Checkout confirmation flag references and operator approval implementation detail.
- Repeated readiness, plan, trial, and usage summaries.
- Customer payment provider diagnostics unrelated to MyTitan subscription billing.
- Technical wording such as "authoritative" where plain business language is clearer.

## Retained Elsewhere

Platform Admin diagnostics remain available in `app/pages/platform/index.tsx` and related platform configuration routes. The tenant page no longer loads or links to the Platform Billing Catalog, but the admin catalog, reveal controls, masked identifiers, readiness checks, sync controls, canary evidence, and change history remain available to authorised platform admins.

## Resulting Tenant IA

The page now has five customer-facing sections:

1. Account summary
2. Choose your plan
3. Buy extra job packs
4. Payment method
5. Billing history

The summary shows the current plan once, billing status, billing interval, included jobs, used jobs, remaining jobs, next renewal/reset date, and one primary action.

## Action Safety

Visible actions call existing protected flows:

- Plan checkout: `/billing/checkout-session`
- Billing portal/payment method/history: `/billing/portal`
- Job-pack checkout: `/billing/job-completion-packs/checkout-session`
- Owner verification resend: `/auth/resend-verification`

Owner permission, email verification, Stripe readiness, pending purchase creation, webhook-confirmed credit grants, idempotency, and audit logging remain enforced server-side. Job credits are not granted by the page.

## Known Product Gap

The billing API does not currently return saved card brand, last four digits, expiry, or invoice rows. The tenant UI therefore avoids inventing those details and routes active subscriptions to the secure Stripe Billing Portal. Empty history states read "No MyTitan invoices yet." unless portal access is available.
