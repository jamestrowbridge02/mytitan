# MyTitan Enterprise Phase 1K Audit

Date: 2026-06-04

## What Already Exists

- BYOG integration foundations exist through tenant-scoped integration credentials, OAuth connection records, webhook endpoints, API tokens, orchestration events, and connection health surfaces.
- Accounting/payment boundaries already separate MyTitan Stripe SaaS billing/job packs from tenant-owned customer payment providers.
- Calendar/scheduling foundations exist for job assignment, booking windows, technician capacity, Google Calendar OAuth status, and scheduling intelligence.
- Job/invoice/payment continuity exists on the job model through lifecycle status, invoice issue/paid dates, payment links/receipts, quote conversion, customer approvals, and billing verification scripts.
- File/artifact storage exists through managed `DocumentArtifact` records, tenant-scoped storage paths, portal visibility flags, and portal-safe downloads.
- Analytics/dashboard systems exist for executive, operations, revenue, customer, capacity, benchmarks, traffic, and saved layout preferences.
- In-app notifications and tracked outbound email safety controls exist with routing verification.
- Mobile shell exists through the technician queue, execution records, evidence references, ETA/customer journey actions, and capacity checks.
- Role permissions exist through legacy roles plus a permission snapshot layer.
- Guided setup and onboarding exist through tenant settings, setup wizard, guided setup state, and trade-specific defaults.

## Partial Areas

- Accounting bridge work is readiness and dry-run export queue only. No live Xero/QuickBooks/Sage sync is enabled.
- Calendar bridge work is readiness and export queue only. No external calendar mutation is enabled.
- Offline support is a scoped assigned-job packet plus mutation queue. It is not a broad authenticated page cache.
- File folders are metadata-derived from artifact entity/kind until a deeper document taxonomy is needed.
- Custom KPI widgets use real existing data only; unsupported forecast-style metrics remain absent.
- Client comms are queued in-app-first metadata events unless existing safe sender controls and tenant provider readiness allow live sending later.

## Conflict Risks

- Live provider writes could duplicate invoices/payments or mutate external calendars unless explicit tenant-owned credentials, scopes, and idempotency are verified.
- Offline job status updates can conflict when the server job version changed after packet issue.
- Artifact visibility changes can expose customer documents unless portal visibility remains explicit and tenant-scoped.
- Dashboard widget expansion can overstate insight if cost/revenue fields are missing.
- Automated client comms can spam if dedupe/rate limit/opt-out controls are bypassed.

## Safe Bridge Strategy

- Use tenant-owned provider readiness states: `setup_needed`, `ready`, `needs_reconnect`, and `error`.
- Queue accounting/calendar/client-comms intents in `IntegrationOrchestrationEvent` with explicit dry-run/no-live-mutation metadata.
- Scope offline packets to assigned jobs only and exclude secrets, portal tokens, OAuth material, private URLs, and broad app cache state.
- Keep customer payment ownership messaging intact and never create MyTitan Stripe checkout sessions for customer money.
- Audit exports, dry-run queues, walkthrough updates, and offline sync actions.
- Surface readiness in product UI with direct language that foundations are not live sync.

## Rollback Plan

- Hide Phase 1K UI surfaces through navigation/feature-flag controls.
- Leave underlying job/artifact/payment records intact; Phase 1K folder moves are metadata-only.
- Remove or ignore `phase1k.*` orchestration queue rows if rollout is paused.
- Revert the enum-only migration only before dependent rows exist; after rollout, prefer disabling UI/API use rather than dropping enum values.
- Re-run billing, notification routing, production readiness, and stable e2e checks after rollback.
