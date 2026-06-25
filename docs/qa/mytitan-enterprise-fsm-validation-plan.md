# MyTitan Enterprise FSM Validation Plan

Status: QA planning
Scope: validation strategy for enterprise FSM delivery backlog.

## Validation Principles

- Preserve the current green baseline before each phase.
- No runtime feature is considered ready without focused tests and full stable validation.
- Stripe mutation commands are not part of normal validation.
- Customer payment tests must prove MyTitan Stripe is not used.
- Hardware/ActivGuard tests must prove bridge isolation.
- Offline tests must prove scoped job packets and no full-page authenticated caching.
- Tenant isolation and RBAC are release blockers.

## Required Baseline Commands

Run after every implementation phase:

```sh
bash ./scripts/healthcheck.sh
bash ./scripts/production-readiness-check.sh
bash ./scripts/validate-e2e-stable.sh
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:verify-subscription-prices'
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:sync-job-products'
```

Expected baseline:
- Stable E2E: no failed tests.
- Healthcheck: `HTTP/1.1 200 OK`.
- Production readiness: all expected checks ready, with external uptime monitor allowed to remain `not_configured`.
- Subscription price verification: dry-run ready.
- Job pack sync: no checkout enabled unless readiness is truly ready and explicit confirmation flag is set.

## Phase 0 Validation

Focus:
- Feature flags default off.
- Provider contracts sanitize diagnostics.
- No existing route behavior changes.

Tests:
- Unit: feature flag resolver.
- API: disabled feature returns `FEATURE_DISABLED` or setup-needed.
- Contract: provider readiness cannot be `ready` without verification timestamp.
- Security: platform-admin diagnostics contain no secrets/private hosts.

Release gate:
- Full stable suite passes unchanged.

Rollback validation:
- Turning any enterprise flag off removes UI/API writes.

## Phase 1 Validation

### Job-Sheet Estimates

Tests:
- Estimate created from job sheet stores tenant-scoped `Quote`.
- Quote line items preserve quantity, unit price, tax, currency, and totals.
- Approved quote converts once to job line items.
- Declined/draft quote conversion is blocked.
- Customer approval sees only that customer's quote.
- Viewer/technician cannot convert quote.

Regression checks:
- Existing revenue operations and customer approvals specs pass.
- Job detail and mobile job sheet remain readable.

### Tenant-Owned Payment Provider Expansion

Tests:
- Missing tenant provider returns setup-needed guidance.
- Provider readiness shows masked references only.
- Customer payment intent does not create MyTitan Stripe checkout.
- Provider webhook signature/dedupe works.
- Cross-tenant provider event cannot update another tenant.
- Public payment/status surfaces expose no raw provider IDs.

Regression checks:
- Stripe webhook hardening specs pass.
- `billing:verify-subscription-prices` remains dry-run ready.
- `billing:sync-job-products` does not enable checkout.

### Inventory and Truck Stock

Tests:
- Technician sees assigned van stock only.
- Job part reservation reduces available quantity.
- Part usage creates one `StockMovement`.
- Duplicate idempotency key creates no duplicate movement.
- Low-stock creates draft PO only.
- Technician cannot use unassigned inventory.

Regression checks:
- Parts/inventory specs pass.
- Job margin/totals remain correct.

### RBAC and Immutable Audit

Tests:
- Legacy role matrix unchanged.
- New enterprise features default deny when flag off.
- Shadow policy evaluator matches existing permissions before enforcement.
- Denied enterprise access writes sanitized audit.
- Safe error cleanup cannot delete ledger entries.

Regression checks:
- Workspace governance, pricing adjustment, platform admin, and integration access specs pass.

Release gate:
- Phase 1 focused specs pass.
- Full stable suite passes.
- No MyTitan Stripe customer-money path exists.

Rollback validation:
- Disable flags and verify existing quote, billing, inventory, and role behavior remains available.

## Phase 2 Validation

### Customer Portal Gallery and ETA

Tests:
- Portal gallery includes only `portalVisible=true` artifacts.
- Private artifacts are hidden from customer/public routes.
- Coarse ETA shown without raw GPS.
- Share session expires and then returns no live data.
- Public token paths sanitized in analytics/logs.

### Route Optimisation Preview

Tests:
- Optimization run creates recommendations only.
- No job/booking assignment changes before explicit apply.
- Apply revalidates availability and conflicts.
- Dispatcher/admin can apply; technician/viewer cannot.
- Recommendations include reason/confidence.

### Offline Job Packets

Tests:
- Technician downloads assigned packet only.
- Packet excludes payment checkout IDs, public tokens, customer workspace tokens, provider secrets, unassigned data, and full tenant user list.
- Packet has expiry, version, and payload hash.
- Logout wipes local packet state.
- Expired packet cannot be downloaded.

### Compliance Packs

Tests:
- Disabled pack has no effect.
- Enabled pack adds required evidence checks.
- Missing evidence opens compliance exception.
- Pack status copy avoids legal certification claims.

Release gate:
- Mobile/tablet UI checks pass.
- Portal and public route leakage tests pass.
- Full stable suite passes.

Rollback validation:
- Disable each Phase 2 flag and verify current portal, scheduling, technician, and compliance flows remain.

## Phase 3 Validation

### Supplier Integrations

Tests:
- Unverified supplier returns setup-needed.
- Catalogue lookup masks supplier references.
- Low-stock creates draft PO only.
- No supplier order submission in MVP.
- Supplier credentials never appear in UI/logs.

### Accounting Export

Tests:
- Export batch is tenant-scoped.
- Duplicate export request is idempotent.
- Export excludes secrets and raw provider IDs.
- Finance/admin access only.

### Hardware Telemetry Bridge

Tests:
- Unknown provider event rejected/quarantined.
- Telemetry writes only to matching tenant.
- UI reads rollups, not raw event stream.
- Backpressure prevents core API degradation under event burst.
- Proprietary Titan/ActivGuard contract tests pass unchanged.

Release gate:
- Provider contract test suite passes.
- Load test threshold met for telemetry ingestion.
- Full stable suite passes.

Rollback validation:
- Disable provider route and confirm existing integrations, dashboard, and scheduling remain healthy.

## Phase 4 Validation

Focus:
- Live ETA, supplier submission, GDPR workflows, CIS verification, predictive maintenance.

Tests:
- Live ETA requires consent/policy and expires.
- Supplier submission requires approval and idempotency.
- GDPR export excludes secrets, tokens, provider IDs, private URLs, and raw IPs.
- GDPR deletion respects legal hold and audit retention.
- CIS sensitive fields encrypted/masked and finance/admin scoped.
- Predictive maintenance remains advisory and never auto-creates paid work.

Release gate:
- Legal/privacy review complete.
- Full stable suite passes.

Rollback validation:
- Disable each automation; preserve source records and audit.

## Phase 5 Validation

Focus:
- Enterprise group reporting, parent-company governance, scale hardening.

Tests:
- Parent admin sees aggregate metrics only by default.
- Cross-company detail denied without explicit grant.
- Franchise owner cannot access sibling company data.
- Aggregate projections contain no customer-sensitive detail unless granted.
- Audit export hash verifies.
- Telemetry retention and projection jobs meet performance targets.

Release gate:
- Cross-tenant query audit complete.
- Load tests pass.
- Full stable suite passes.

Rollback validation:
- Disable group dashboards and projection jobs; tenant-local operation remains unaffected.

## Test Matrix by Risk

| Risk | Required Tests |
| --- | --- |
| MyTitan Stripe customer-money misuse | Payment boundary E2E, checkout helper spy/contract, public payment route tests |
| ActivGuard regression | Adapter isolation contract, no-op proprietary provider regression |
| Tenant data leak | Cross-tenant API tests for every new route |
| Offline secret leak | Packet snapshot denylist tests |
| RBAC breakage | Legacy role matrix and policy shadow tests |
| Private portal media exposure | Portal visibility tests |
| Supplier accidental order | Draft-only PO tests and disabled submission route |
| Route auto-mutation | Preview-only tests |
| GDPR export leak | Export scrubber tests |
| Validation instability | Focused spec then full stable suite |

## Release Checklist

- Feature flag defaults reviewed.
- Migrations additive and deployed in staging.
- Focused tests green.
- Full stable validator green.
- Health/readiness checks green.
- Billing price dry-run green.
- Job-pack sync does not enable checkout.
- Security review complete for secrets/tokens/provider IDs.
- Tenant isolation tests complete.
- Rollback flag tested.
- Support/readiness copy does not fake readiness.
