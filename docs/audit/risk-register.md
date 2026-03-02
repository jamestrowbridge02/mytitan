# Risk Register

## High

### R1: Webhook idempotency not explicit
- Area: Stripe webhook handling
- Files:
  - `api/src/billing/billing.service.ts`
  - `api/src/main.ts`
- Observation:
  - Signature verification is correct.
  - No explicit persistence of processed `event.id`.
- Risk:
  - Duplicate delivery can re-trigger side effects (notifications, status writes).
- Mitigation:
  1. Add `WebhookEvent` table keyed by provider + `eventId`.
  2. Wrap handlers in idempotency check transaction.

### R2: Mixed flag gating semantics
- Area: feature flags
- Files:
  - `api/src/common/feature-flags.ts`
  - multiple controllers (inventory/locations/jobs/command-centre)
- Observation:
  - Some routes throw 503 when off; others return soft fallback payloads.
- Risk:
  - Client complexity, hidden no-op behavior, harder QA matrix.
- Mitigation:
  1. Define per-module gating policy (hard vs soft).
  2. Align route contracts and document expected off-state response.

## Medium

### R3: Smoke script false warning on  flag
- Area: ops validation
- File: `scripts/-polish-smoke.sh`
- Observation:
  - Reads shell env, not `.env`, causing mismatch warnings.
- Risk:
  - Operator confusion; noisy release checks.
- Mitigation:
  1. Read `/opt/mytitan/.env` consistently.
  2. Emit explicit mismatch diagnostics.

### R4: Inconsistent front-end navigation patterns
- Area: app UX
- Files: multiple pages + `components/dashboard-shell.tsx`
- Observation:
  - Mixed `<a>`, `Link`, and direct `window.location.*` for internal nav.
- Risk:
  - Full page reloads, inconsistent state retention.
- Mitigation:
  1. Standardize internal nav on `next/link` or router push.
  2. Leave direct location changes only for explicit hard redirects/logout.

### R5: No global request ID/correlated structured logging
- Area: reliability/ops
- Observation:
  - Audit logs exist; app-level request correlation middleware not present.
- Risk:
  - Harder incident tracing across API + webhook + async side effects.
- Mitigation:
  1. Add request-id middleware and include in structured logs.
  2. Propagate request-id into audit metadata where available.

## Low

### R6: Schema migration churn includes historical destructive migration
- Area: migration history
- File: `api/prisma/migrations/20260222170000_billing_tiers/migration.sql`
- Observation:
  - Legacy table/column drops in historical migration.
- Risk:
  - Fresh environment migration is okay; legacy environments need careful upgrade sequencing.
- Mitigation:
  1. Keep backup/restore verification in release runbook.
  2. Add migration risk notes per release.

## Existing Strengths
- Tenant scoping is pervasive across core entities.
- Auth + roles are consistently applied to most controllers.
- Smoke scripts are present and actively used.
- /login/public flows are implemented and testable.

## Prioritized Next Actions (30/60/90)
1. 30 days: webhook idempotency table +  smoke script fix.
2. 60 days: flag gating normalization + request-id logging.
3. 90 days: route contract docs + UX state component standardization.
