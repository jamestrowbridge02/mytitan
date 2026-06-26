# Phase 18 Evidence-Based Certification Gate

Checked: 2026-06-26
Owner: Platform
Status: Evidence-led gate; no category may show 10/10 while critical evidence is missing.

## Gate Rules

- Do not claim 10/10 unless all critical evidence for the category is attached.
- Do not fake uptime, customers, reviews, revenue, AI, provider readiness, security certification, or production Web Vitals.
- Do not expose secrets or print secret values in scorecard evidence.
- Do not route tenant customer money through MyTitan billing Stripe.
- Do not mutate Stripe products or prices during readiness checks.
- Keep tenant isolation, RBAC, support mode, auditability, billing boundaries, and zero skipped tests intact.

## Technical Maturity Evidence

Attached:
- Stable suite path: `scripts/validate-e2e-stable.sh`.
- Production build path: `docker compose build app api marketing`.
- Migration health path: `docker exec -w /app mytitan_api /bin/sh -lc 'npx prisma migrate deploy'`.
- Docker health path: `scripts/healthcheck.sh`.
- Production readiness path: `scripts/production-readiness-check.sh`.
- API route ownership: `api/src/**/*.controller.ts`.
- Request id/logging: `api/src/common/request-id.middleware.ts`, `api/src/common/request-log.interceptor.ts`.
- Payment and notification idempotency: `api/prisma/migrations/20260225060000_webhook_event_idempotency`, `api/prisma/migrations/20260225162110_notifications_idempotency_key`.
- Dead route/action inventory path: `scripts/generate-routes-inventory.sh`, `docs/audit/routes-inventory.md`.

Missing before 10/10:
- Full repository TypeScript pass artifact, or exact legacy-file exception list if out-of-config scripts fail.
- Dependency vulnerability audit report from release CI.
- Bundle-size or route-size budget artifact.

Local TypeScript status:
- `cd app && npx tsc --noEmit --pretty false` was run on 2026-06-26.
- Result: not passing; do not count as a TypeScript pass.
- Exact remaining files reported: `api/src/billing/billing-pricing.ts`, `api/src/billing/billing.constants.ts`, `app/e2e/booking-public-flow.spec.ts`, `app/e2e/job-form-builder.spec.ts`, `app/e2e/job-form-save-draft.spec.ts`, `app/e2e/job-lifecycle.spec.ts`, `app/e2e/platform-autopilot.spec.ts`, `app/e2e/stripe-webhooks.spec.ts`, `app/e2e/tablet-layouts.spec.ts`, `app/e2e/ui-hardening.spec.ts`.
- Local `api` and `marketing` TypeScript checks were not attached because only `app/node_modules` exists in this workspace and network access is restricted, so `npx` attempted a registry lookup.
- Remediation item: add CI-owned workspace installs and package-specific `typecheck` scripts that exclude unrelated generated/runtime E2E files or fix the listed files, then attach the passing artifacts before any technical 10/10 claim.

## Operational Maturity Evidence

Attached:
- External uptime monitor configuration path: `docs/external-monitoring.md`.
- Truthful uptime state helper: `scripts/external-monitoring-status.sh`.
- Production readiness status line: `scripts/production-readiness-check.sh`.
- Backup freshness helper: `scripts/backup-readiness-status.sh`.
- Restore-drill checklist: `docs/backup-restore.md`.
- Rollback checklist: `docs/deployment-runbook.md`.
- Incident and alert path: `docs/ops-alerts.md`, `scripts/report-health-degraded.sh`, `api/scripts/send-operational-alert.ts`.
- Scheduler health: `scripts/summary-scheduler-status.sh`.
- Autopilot evidence: `app/e2e/platform-autopilot.spec.ts`.
- Alert queue evidence: `app/e2e/phase-13-launch-operations.spec.ts`.

Missing before 10/10:
- Real external uptime monitor provider, non-secret monitor identifier, and saved active/healthy state.
- Latest production backup and restore-drill timestamps attached to the release record.

## Security And Tenancy Evidence

Attached:
- Tenant isolation tests: `app/e2e/trial-and-platform-admin.spec.ts`, `app/e2e/workspace-governance.spec.ts`.
- Platform-admin isolation tests: `app/e2e/platform-admin-recovery.spec.ts`.
- Support-mode audit evidence: `api/src/admin/platform-admin.service.ts`, `app/pages/platform/index.tsx`.
- Secret redaction checks: `scripts/stripe-key-guard.sh`.
- Stripe Connect vault safety checks: `scripts/test-production-readiness-connect-vault.sh`.
- Webhook signature checks: `app/e2e/stripe-webhooks.spec.ts`.
- Upload/media permission checks: `app/e2e/artifacts-foundation.spec.ts`, `app/e2e/ui-hardening.spec.ts`.
- Portal isolation checks: `app/e2e/public-portal.spec.ts`.
- API token scope checks: `app/e2e/integrations-platform.spec.ts`.
- Security headers/CSP path: `app/e2e/final-production-readiness.spec.ts`, `app/next.config.js`, `marketing/next.config.js`.

Missing before 10/10:
- Independent security assessment: not attached.
- Production dependency vulnerability audit report: not attached.

## Platform Architecture Evidence

Attached:
- Tenant payment separation ADR: `docs/architecture/adr/0001-tenant-payment-separation.md`.
- MyTitan billing boundary: `api/src/billing/billing.service.ts`, `app/e2e/payments-hardening.spec.ts`.
- Stripe no-mutation verification: `api/scripts/verify-subscription-prices.js`, `api/scripts/sync-job-completion-products.js`.
- Provider readiness truth: `app/e2e/integrations-platform.spec.ts`.
- Archive periods, numbering, and platform operations centre: `app/e2e/phase-13-launch-operations.spec.ts`.

Missing before 10/10:
- Live partner marketplace install lifecycle with signed marketplace webhook contracts.
- Production provider canary artifacts for every advertised live payment provider.

## Product Experience Workflow Checklist

Every workflow must have a clear next action, success state, error state, mobile safety, no dead buttons, and search or command discoverability where relevant.

- Signup: `/signup`.
- Onboarding: `/dashboard/setup-wizard`.
- Business profile: `/dashboard/settings`.
- Locations: `/dashboard/locations`.
- Services: `/dashboard/booking/settings`.
- Public booking: `/portal/booking/[...booking]`.
- Trade booking: `/trade/portal/[token]`.
- Calendar: `/dashboard/calendar`.
- Jobs: `/dashboard/jobs`.
- Job sheet: `/dashboard/jobs/[id]`.
- Customers: `/dashboard/customers`.
- Invoices: `/dashboard/finance`.
- Payments: `/dashboard/settings/payments`.
- Communications: `/dashboard/communications`.
- Settings: `/dashboard/settings/operations`.
- Platform admin: `/platform`.

Missing before 10/10:
- Moderated usability study with task-completion evidence.
- First-user onboarding under 10 minutes with observed evidence.

## Visual Polish Evidence

Attached:
- Tenant route shell checks: `app/e2e/shell-polish.spec.ts`.
- Mobile shell/no-overflow checks: `app/e2e/mobile-shell.spec.ts`.
- Tablet checks: `app/e2e/tablet-layouts.spec.ts`.
- Public booking visual state checks: `app/e2e/booking-public-flow.spec.ts`.
- Marketing/pricing visual checks: `app/e2e/marketing-pricing.spec.ts`.
- Platform admin mobile scorecard check: `app/e2e/phase-17-excellence-gate.spec.ts`.
- Empty/loading/success/error state components: `app/components/states/*`, `app/components/ui/*`.

Missing before 10/10:
- Stored screenshot-diff baseline for all key tenant routes, public booking, marketing homepage/pricing, platform admin, mobile viewport, and dark/light mode where implemented.
- Production visual-regression artifact set.

## Marketing Evidence

Attached:
- SEO metadata checks: `marketing/components/MarketingSeo.tsx`, `app/e2e/marketing-pricing.spec.ts`.
- OpenGraph checks: `marketing/components/MarketingSeo.tsx`.
- No fake testimonials: `app/e2e/final-production-readiness.spec.ts`.
- No fake customer count, fake revenue, or unsupported uptime claim: `app/e2e/phase-15-product-craft.spec.ts`, `app/e2e/launch-proof.spec.ts`.
- Pricing clarity: `marketing/pages/pricing.tsx`.
- Integration readiness truth: `marketing/pages/index.tsx`, `marketing/pages/security.tsx`.

Missing before 10/10:
- Production Web Vitals evidence: not attached.
- Production Lighthouse report: not attached.
- Structured data evidence is only counted where implemented.

## Real-World Acceptance Evidence Slots

These slots are not complete unless real evidence is entered:
- Moderated usability study.
- First-user onboarding under 10 minutes.
- Wheel A&R one-week pilot.
- Mobile technician field test.
- Trade customer portal test.
- Live Stripe deposit/refund canary.
- Customer portal acceptance.
- Invoice/payment acceptance.

## Scorecard Result

Current scorecard is allowed to show high evidence-backed scores below 10/10. It is blocked from showing 10/10 while any critical evidence above remains missing.
