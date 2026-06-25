# MyTitan Enterprise FSM MVP Scope

Status: implementation planning
Source documents:
- `docs/product/mytitan-enterprise-fsm-prd.md`
- `docs/architecture/mytitan-enterprise-fsm-technical-blueprint.md`
- `docs/architecture/mytitan-feature-conflict-risk-register.md`
- `docs/roadmap/mytitan-enterprise-fsm-phased-roadmap.md`

## MVP Goal

Deliver enterprise FSM depth by extending verified MyTitan foundations without weakening tenant isolation, billing boundaries, hardware stability, or validation. MVP should make the existing job sheet, quote, payment readiness, inventory, customer portal, RBAC/audit, route planning, offline packet, and compliance foundations implementation-ready before higher-risk provider automation.

## MVP Guardrails

- Runtime code is not changed by this document.
- `Company` remains the hard tenant boundary.
- MyTitan Stripe remains SaaS subscription and job-pack billing only.
- Customer/operator payments remain tenant-owned and BYOG.
- Hardware/ActivGuard integrations use bridge/isolation adapters only.
- Offline mobile uses scoped job packets, not authenticated full-page caching.
- Every new capability is behind a feature flag and has a rollback path.
- No readiness state can be shown as ready without a real verification signal.
- No raw provider IDs, secrets, public tokens, raw IPs, or private hosts appear in UI or logs.

## Prioritized MVP Workstreams

### 1. Quoting and Estimates Inside Job Sheet

Objective: make quoting a first-class part of job execution while reusing existing `Quote`, `QuoteLineItem`, `JobLineItem`, and revenue flows.

In scope:
- Estimate panel on job detail/job sheet.
- Convert quote line items into job line items with tax/total preservation.
- Approval/decline status surfaced in job timeline.
- Audit entries for quote create, send, approve, decline, and convert.
- Mobile-readable estimate summary for technicians.

Out of scope:
- External e-signature provider.
- Automatic accounting sync.
- Customer payment collection.

Exit criteria:
- Approved quote converts to job without rekeying totals.
- Existing quote/revenue tests remain green.
- No normal user sees platform catalog or Stripe internals.

### 2. Tenant-Owned Payment Provider Expansion

Objective: expand payment readiness and provider abstraction while preserving MyTitan Stripe boundaries.

In scope:
- `TenantPaymentProviderAccount` readiness model.
- Masked provider status UI.
- Provider verification dry-run.
- Customer payment intent state model with no live checkout until provider is verified.
- Boundary tests proving MyTitan Stripe is not used for customer funds.

Out of scope:
- Automatic live payment activation.
- Stripe product/price mutation.
- Job-pack checkout enablement changes.

Exit criteria:
- Tenant payment provider can be setup-needed/degraded/ready.
- No provider secret or raw ID is exposed.
- Customer payment routes fail safely without tenant provider readiness.

### 3. Inventory and Truck Stock

Objective: improve field stock workflows using existing stock, inventory location, job part, and PO models.

In scope:
- Van/truck inventory locations.
- Part reservation and usage from job sheet.
- Low-stock trigger to draft PO.
- Mobile stock check view.
- Idempotent stock movement keys for future offline sync.

Out of scope:
- Automatic supplier order submission.
- Complex warehouse replenishment optimization.

Exit criteria:
- Truck stock usage writes one stock movement.
- Low-stock creates draft PO only.
- Job margin reflects used parts.

### 4. Customer Portal and Live Tracking Foundation

Objective: add customer-visible progress and media improvements without raw live tracking.

In scope:
- Portal media gallery using portal-visible artifacts.
- Coarse ETA/status timeline.
- Expiring live-share session model, disabled by default.
- Sanitized visit/portal event references.

Out of scope:
- Raw GPS trail display.
- Always-on technician tracking.
- SMS automation.

Exit criteria:
- Customer portal never exposes private artifacts.
- ETA/share links expire and are audited.
- Token paths remain sanitized in analytics/logs.

### 5. RBAC and Audit-Log Hardening

Objective: introduce granular policies and immutable audit foundations without breaking existing roles.

In scope:
- Compatibility mapping from existing roles to policy bundles.
- Append-only audit ledger for high-risk enterprise actions.
- Permission decision logging for denied enterprise actions.
- Location/entity scoped grants design.

Out of scope:
- Full custom role builder UI.
- Cross-company detail drilldown.

Exit criteria:
- Legacy OWNER/ADMIN/DISPATCHER/FINANCE/TECHNICIAN/VIEWER behavior is unchanged.
- Enterprise feature permissions default deny when flag is off.
- Audit ledger cannot be cleared through safe-error-log cleanup.

### 6. Route Optimisation Bridge

Objective: add preview-only route optimization contracts without automatic scheduling changes.

In scope:
- `RouteOptimizationRun` and recommendation model.
- Internal heuristic provider before external maps.
- Dispatcher preview UI.
- Explicit apply gate with audit event.

Out of scope:
- Automatic route assignment.
- Live GPS-based optimization.
- Paid map provider integration.

Exit criteria:
- Optimization produces recommendations only.
- No booking/job assignment changes until explicit apply.
- Existing booking availability validation remains authoritative.

### 7. Offline Job Packets

Objective: let technicians work from scoped job packets without full authenticated page caching.

In scope:
- Read-only packet generation for assigned jobs.
- Packet expiry, version, and payload hash.
- Exclusion of payment IDs, portal tokens, provider secrets, and unassigned data.
- Sync readiness indicators.

Out of scope:
- Service worker caching of authenticated pages.
- Offline payment collection.
- Multi-job bulk download.

Exit criteria:
- Technician can download assigned packet only.
- Packet contains only allowed fields.
- Logout wipes local packet state.

### 8. Template and Compliance Expansion

Objective: expand templates and compliance requirements safely through versioned packs.

In scope:
- Compliance pack schema and review status.
- Template requirement mapping.
- Compliance exception creation from missing evidence.
- UK pack MVP as reviewed draft, not legal certification.

Out of scope:
- Automated regulatory advice.
- Weather provider automation.
- GDPR deletion workflow automation.

Exit criteria:
- Compliance packs are versioned and disabled by default.
- Missing evidence produces a compliance exception.
- UI copy avoids false legal readiness.

## MVP Feature Flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `enterprise_job_sheet_estimates` | off | Estimate panel and quote/job conversion enhancements |
| `tenant_payment_provider_v2` | off | BYOG payment provider readiness and customer payment intent model |
| `truck_stock_mvp` | off | Truck inventory, job part usage, low-stock PO draft |
| `customer_portal_gallery_eta` | off | Portal gallery and coarse ETA/share foundation |
| `enterprise_rbac_policies` | off | Policy bundles and scoped grants |
| `immutable_audit_ledger` | off | Append-only enterprise audit ledger |
| `route_optimization_preview` | off | Preview-only route recommendations |
| `offline_field_packets` | off | Scoped job packet generation/download |
| `compliance_packs_uk` | off | Versioned UK compliance pack MVP |

## MVP Release Gates

- Schema migrations are additive and reversible by flag.
- Stable E2E validator passes.
- Payment boundary tests prove MyTitan Stripe is not used for customer payments.
- Hardware/ActivGuard code paths are untouched or isolated by adapter contracts.
- Offline packet tests prove no forbidden data is serialized.
- RBAC tests prove legacy roles retain current behavior.
- Customer portal tests prove private artifacts and tokens are not exposed.
- Route optimization tests prove preview-only behavior.

## MVP Rollback Strategy

- Disable feature flags per tenant and globally.
- Retain additive tables but stop UI/API writes behind flags.
- Revert UI entry points without deleting collected audit records.
- For payment-provider expansion, force customer payment routes to setup-needed guidance.
- For offline packets, expire all active packets and reject mutation submissions.
- For route optimization, hide recommendations and prevent apply.
- For compliance packs, deactivate pack mappings while preserving audit trail.
