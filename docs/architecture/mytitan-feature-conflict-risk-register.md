# MyTitan Enterprise Feature Conflict and Risk Register

Status: draft
Scope: conflict mapping and safe resolution for enterprise FSM expansion.

## Summary

Most requested capabilities have a partial MyTitan foundation. The safest path is extension through bridges and feature flags. The highest-risk areas are tenant-owned payments, hardware/telematics, offline sync, live tracking, granular RBAC migration, and multi-entity reporting because they can weaken billing boundaries, telemetry stability, tenant isolation, or validation stability.

## Risk Register

| ID | Feature Area | Current State | Conflict Surface | Risk | Severity | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Customer payments | Payment readiness and BYOG messaging exist | `billing`, `payment-collection`, public payment routes, Stripe webhook tests | MyTitan Stripe could be used for tenant customer money | Critical | Separate tenant payment provider models and tests; no shared Stripe checkout helper |
| R-002 | SaaS catalog pricing | Platform catalog overrides exist | `BillingCatalogOverride`, platform-admin UI, Stripe dry-run scripts | Unsafe product/price mutation or raw ID exposure | High | Dry-run by default, masked IDs, explicit mutation flag only |
| R-003 | Accounting sync | Revenue and quote models exist | `Quote`, `Job`, `RevenueCollectionTask`, invoice fields | Duplicate export or customer data leak | High | Export batches with idempotency and tenant-scoped downloads |
| R-004 | Open telematics | No open telemetry domain verified | Proprietary Titan/ActivGuard hardware logic, integrations | Hardware regression or event semantic conflict | Critical | Provider bridge, adapter isolation, contract tests |
| R-005 | Telemetry volume | Internal monitoring and website events exist | Postgres, dashboards, Redis, analytics | High-volume raw events degrade API/UI | High | Queue ingestion, partitioning, rollups, retention |
| R-006 | Location tracking | No live tracking verified | Technician privacy, public status tokens | Personal tracking or token leakage | High | Coarse ETA MVP, consent/policy checks, expiring share sessions |
| R-007 | Offline mobile | PWA plan says no service worker | Auth pages, customer data, payment routes, local storage | Sensitive data retained after logout | Critical | Packet sync only, encrypted local store, logout wipe, no page cache |
| R-008 | Offline mutations | Job execution and stock usage exist | `JobExecutionRecord`, `JobPart`, `StockMovement` | Stale writes or duplicate stock movements | High | Versioned packets and idempotent mutation keys |
| R-009 | Subcontractor portal | No separate subcontractor principal verified | `User`, `TradeAccount`, customer portal | Overbroad tenant/customer access | High | Separate external principal and assignment grants |
| R-010 | Unified UI | App, platform, customer, public shells exist | Next.js pages and shared components | Portal exposes operator controls | High | Shell isolation and route-specific permission tests |
| R-011 | Measurement profiles | Templates/custom fields exist | `JobSheetTemplate`, `CustomField`, form data | Protected template blocks overwritten | Medium | Profile references layered onto templates |
| R-012 | Media galleries | Artifacts and portal visibility exist | `DocumentArtifact`, job media, customer workspace | Private media exposed to customers | Critical | Portal visibility policy and E2E coverage |
| R-013 | SMS automation | Email routing exists; SMS not verified | Notification routing and consent | Fake readiness or consent breach | High | Provider readiness, consent records, setup-needed state |
| R-014 | UK compliance packs | SLA/compliance exceptions exist | Template engine, compliance service | False regulatory readiness | High | Versioned packs with review status and disclaimers |
| R-015 | Weather checks | No provider verified | Site/customer location data | External dependency and location privacy | Medium | Advisory snapshots, retention, degraded state |
| R-016 | GDPR export/delete | Policy pages exist; workflow not verified | Audit, artifacts, tokens, retention | Deletes required audit or exports secrets | High | Data subject workflow with legal hold and secret scrubbers |
| R-017 | Route optimization | Scheduling capacity exists | Booking slots, assignments, location context | Bad automatic schedule changes | High | Preview-only MVP and explicit apply |
| R-018 | Map providers | No provider verified | Customer addresses, technician locations | Address leak to third party | High | BYOG/platform-approved providers, redacted logs |
| R-019 | Inventory truck stock | Inventory locations and job parts exist | `InventoryStock`, `JobPart`, `StockMovement` | Negative or duplicate stock | High | Existing reservation flow plus offline idempotency |
| R-020 | Supplier integrations | PO and supplier models exist | Supplier credentials, PO state | Unapproved external order | High | Catalogue lookup and draft PO first; submission later |
| R-021 | CIS verification | Trade accounts exist, subcontractor domain absent | Finance roles, sensitive identifiers | Tax identifier exposure or wrong status | Critical | Separate subcontractor/CIS schema with encryption and RBAC |
| R-022 | Granular RBAC | Coarse role permissions exist | `RolesGuard`, `assertPermission`, legacy roles | Breaking existing users/tests | Critical | Compatibility bundles and phased policy evaluator |
| R-023 | Immutable audit | Audit events and safe error logs exist | `AuditEvent`, `PlatformSafeErrorLog` | Mixing clearable logs with immutable audit | High | Separate append-only ledger |
| R-024 | Multi-channel booking | Public/operator bookings exist | Booking validators, rate limits | Intake bypasses availability | High | Staging lead model and shared validator |
| R-025 | Asset QR | `JobAsset` is media-like | Public token routes, raw IDs | QR exposes tenant/customer/asset ID | High | New physical asset model and opaque token hash |
| R-026 | Multi-entity parent | `Company` is tenant root; `Location` exists | All tenant-scoped queries and billing | Cross-tenant data leak | Critical | Enterprise group projections and explicit grants |
| R-027 | Franchise billing | Tenant subscriptions are per company | Billing entitlement and platform catalog | Wrong subscription/usage assignment | High | Keep subscription per company; group billing only as separate later phase |
| R-028 | Validation stability | Large E2E suite is green | New flags and migrations | Baseline destabilization | High | Additive migrations, feature flags off by default, focused E2E |

## Features That Must Be Bridged or Isolated

- Hardware-neutral telematics must be bridged through provider adapters; it must not modify proprietary Titan/ActivGuard logic directly.
- Tenant customer payments must be isolated from MyTitan Stripe.
- Offline mobile must be a scoped packet sync layer, not authenticated page caching.
- Subcontractor access must use external scoped principals or grants, not broad workspace users.
- Live tracking must use consented, time-bounded ETA/share sessions, not raw telemetry trails.
- Supplier integrations must create draft POs before any external order submission.
- Multi-entity support must use explicit enterprise grants and aggregate projections, not unscoped cross-company queries.
- Granular RBAC must bridge existing roles through compatibility bundles before policy-only enforcement.

## Review Triggers Before Implementation

Each feature requires architecture review if it:

- Introduces a new external provider or webhook.
- Stores location, telemetry, payment, tax, or identity data.
- Adds cross-tenant or parent-company access.
- Adds offline persistence.
- Changes billing, payment, quote, invoice, or job-pack behavior.
- Changes role permissions or platform-admin visibility.
- Claims readiness, uptime, compliance, or automation success.
