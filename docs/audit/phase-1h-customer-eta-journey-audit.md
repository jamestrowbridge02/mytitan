# Phase 1H Customer ETA and Journey Audit

Date: 2026-05-29

## Current Customer Visibility

- Public job portal already exposes customer-safe job summary, documents, approved evidence, payment state, work history, booking guidance, and support links.
- Customer workspace access is token/account scoped and tenant bound.
- Portal activity currently uses `JobActivity` rows but filters to customer-safe event types.

## Available ETA Signals

- `Job.scheduledAt` provides the real scheduled appointment anchor.
- `Job.assignedUserId` confirms whether a technician is assigned.
- Technician workflow already records arrival through `tech.arrived`.
- Job status, invoice timestamps, approval/signature timestamps, and payment timestamps provide real journey progression.
- New Phase 1H fields store only customer-facing ETA windows and manual status updates.

## Scheduling Confidence

- `scheduled`: derived from existing scheduled job time.
- `confirmed`: manually confirmed ETA window.
- `delayed` / `rescheduled`: manually set operational status.
- `not_available`: no scheduling signal exists.

## Risk Controls

- No GPS, coordinates, internal route, supplier data, billing internals, or private notes are exposed.
- Customer portal receives only filtered journey events and approved customer-visible evidence.
- Route preview is informational only, behind `route_preview_v1`, and does not mutate schedule data.
- Customer ETA updates are behind `customer_eta_v1`, audited, and role scoped.

## Rollback Strategy

- Migration is additive: nullable job ETA fields plus one index.
- Disabling `customer_eta_v1` removes the portal journey payload and blocks ETA mutation APIs.
- Disabling `route_preview_v1` blocks route preview APIs.
- Existing public portal, payment, quote, and inventory workflows remain authoritative.
