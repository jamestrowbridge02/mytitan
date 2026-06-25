# MyTitan Phase 1L Enterprise Ops Audit

Date: 2026-06-04

## Current Implementation

- Job allowance: plan allowance and webhook-backed job pack purchases already feed `getJobCompletionAllowanceSummary`; checkout remains setup-gated by catalog readiness.
- Job packs: packs 1-6 exist in the catalog foundation; packs 5 and 6 are readiness-validated and require mapped Stripe product/price IDs before checkout can become ready.
- Booking flow: public booking has service-line snapshots, location IDs, ETA/status continuity, payment state snapshots, and public status tokens.
- Scheduling/calendar: booking settings expose business hours, blackout dates, locations, staff availability, and public booking state.
- Job sheet sharing: PDF generation and tenant-scoped document artifacts exist; outbound email delivery is guarded by workspace/system readiness and safe-capture controls.
- Completed work storage: jobs retain form data, media assets, PDFs, execution records, execution evidence, signatures, payment state, and audit/activity events.
- Maps/address handling: business locations store structured addresses; job site addresses are retained in submitted form data.
- Admin separation: platform admin APIs sit under `/admin/platform` and require platform-admin access; tenant billing consumes read-only allowance summaries.
- Visual hierarchy: booking, billing, analytics, and platform surfaces use existing operator/dashboard card and table systems.

## Partial Or Missing Before Phase 1L

- No platform-admin manual job allowance override or credit ledger.
- Public bookings were hard-coded to confirmed instead of controlled by a tenant setting.
- Public booking exposed individual provider selection to customers.
- No tenant-scoped job map-link endpoint.
- No third-party job sheet share endpoint with artifact selection.
- Before/after media normalization capped each side at six items.
- Productivity analytics did not expose a focused completed-job productivity report.

## Conflict Risks

- Existing E2E public-booking coverage expects configured booking portals to confirm immediately. The migration keeps current enabled portals auto-confirmed while new tenants default off.
- Stripe checkout must remain setup-required until product/price mappings and explicit enablement are present. Phase 1L does not mutate Stripe or grant credits optimistically.
- Email delivery cannot attach binaries through the current email abstraction. Phase 1L shares a safe manifest and existing PDF link where available, and audits selected records.
- Manual credit removals can reduce available pack credits. The allowance summary preserves deficit messaging when credits are over-consumed.

## Safe Bridge Strategy

- Additive schema only: one tenant setting plus two internal allowance tables.
- Route all platform writes through `/admin/platform/tenants/:tenantId/job-allowance`.
- Keep tenant owner access read-only through `/billing/me`.
- Keep public booking by location, with technician assignment resolved server-side from service/location defaults.
- Generate map links from stored addresses only; no live tracking or provider API calls.
- Use existing outbound email guards for job sheet sharing.

## Rollback Plan

- Disable UI/API callers for Phase 1L endpoints.
- Revert the Phase 1L code changes.
- Drop `TenantJobAllowanceOverride`, `TenantJobAllowanceCredit`, and `TenantSetting.autoConfirmPublicBookings` only after confirming no production tenant depends on them.
- Existing job pack purchases, Stripe state, customer payments, and tenant-owned payment records are unaffected.
