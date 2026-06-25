# Phase 2 category-leader execution audit

Date: 2026-06-04

## Current implementation

MyTitan now exposes a tenant-scoped Phase 2 readiness layer at `/enterprise/phase-2/*` and a dashboard control room at `/dashboard/enterprise`.

The layer covers:

- tenant-owned integration readiness for Xero, QuickBooks, Google Calendar, Microsoft Calendar, Apple iCal, Gmail, and Outlook, including connection state, capability state, dry-run state, reconnect action, safe error category, and audit expectations
- accounting pre-launch previews for invoice export, payment export, customer/contact mapping, VAT/tax mapping, duplicate detection, sync conflict queues, failed retry queues, and manual review state
- true offline field-service workflow readiness using assigned-job packet download, service worker registration, IndexedDB queue foundations, queue clear/retry controls, and conflict states
- enterprise report builder metrics from real tenant jobs, bookings, stock, job parts, artifacts, and execution records, with saved templates, role-scoped access, CSV export, PDF readiness, and audited export actions
- technician mobile workflow language: My Day, Next Job, Get Directions, Start Work, Add Before Photos, Complete Job, Add After Photos, Capture Signature, Record Materials, Sync Status
- operational AI readiness with evidence-backed optional recommendations only
- multi-location enterprise structure and role-scoped reporting readiness
- white-label readiness for tenant logo, brand colours, portals, email branding, custom domain readiness, and tier-gated powered-by controls
- customer acquisition readiness with opt-out, rate-limit, tenant-settings, and no-spam-loop safeguards
- accreditation readiness using backup restore evidence, audit evidence, access review, incident response, data retention, disaster recovery, penetration-test readiness, and SOC2-style trust-pack controls
- external monitoring intentionally deferred for this phase, with tenant-facing warnings suppressed and platform-admin setup guidance only

## Partial or gated

- Xero and QuickBooks live sync remain blocked unless tenant OAuth is verified and explicit live flags are enabled.
- Google and Microsoft Calendar sync remain BYOG readiness contracts unless configured.
- Apple iCal is a safe feed contract only and requires private token infrastructure before exposure.
- Gmail and Outlook communication sync are readiness contracts only; no mailbox mutation is enabled.
- Offline field service remains feature-gated for controlled beta; authenticated page caching is still disabled.
- Operational AI does not call models or make automatic changes.
- Scheduled reports are readiness-only until recipients, export schedule, and email readiness are configured.
- External monitoring remains truthful in production readiness and platform-admin setup surfaces, but it is not configured and is not treated as a tenant-facing blocker in Phase 2B.

## Conflict risks

- Live accounting sync can corrupt external ledgers if idempotency and duplicate detection are bypassed.
- Offline replay can conflict with newer server-side job versions.
- White-label custom domains can leak tenant state if DNS verification and host scoping are skipped.
- Growth automation can become spam without opt-outs, rate limits, and dedupe.

## Safe bridge strategy

- Keep all external providers tenant-owned and BYOG.
- Encrypt credentials server-side only and never return tokens to the frontend.
- Expose provider readiness and dry-run/export queues before live mutation.
- Keep offline data assigned-job scoped and token-free.
- Use real tenant records for reports and recommendation evidence.
- Keep platform diagnostics and tenant business views separated.

## Rollback plan

- Disable `phase2_category_leader_v1` dependent UI navigation if needed.
- Disable provider-specific live flags before touching any live sync queue.
- Leave audit events and queued integration events intact for review.
- Remove `/dashboard/enterprise` from navigation without deleting the API contract.
- Preserve all existing Phase 1 billing, tenant, RBAC, and validation boundaries.
