# MyTitan Enterprise FSM Phased Roadmap

Status: draft roadmap
Principle: ship enterprise depth by extending verified MyTitan foundations without weakening billing, telemetry, tenant isolation, or validation.

## Phase 0: Audit, Guardrails, and Design Contracts

Objectives:
- Freeze current green validation baseline.
- Document provider boundaries for payments, hardware, SMS, maps, weather, accounting, and suppliers.
- Define feature flags, RBAC compatibility strategy, and audit ledger requirements.

Deliverables:
- Architecture decision records for payment boundary, telemetry bridge, offline packet sync, and multi-entity projections.
- Test fixtures for enterprise tenants, branch/franchise locations, finance users, technicians, and external subcontractor principals.
- Provider contract test harness.

Exit criteria:
- Existing stable suite remains green.
- All new schema proposals are additive and migration-reviewed.
- No Stripe mutation or checkout enablement changes.

## Phase 1: Enterprise Foundations MVP

Objectives:
- Add infrastructure needed by later features while user-facing scope stays narrow.

Deliverables:
- Granular RBAC compatibility layer behind `enterprise_rbac_policies`.
- Append-only audit ledger for high-risk enterprise events.
- Managed asset model and QR token issue/revoke/resolve.
- Offline field packet read model for technician job execution.
- Tenant-owned payment provider readiness model with no checkout creation.
- Accounting export batch model and manual export.
- Enterprise group model with aggregate-only projections.

Acceptance:
- Legacy roles keep current access.
- QR tokens expose no raw IDs.
- Offline packets exclude payment/customer portal tokens.
- Parent users see aggregate only unless explicitly granted.

## Phase 2: Operational Workflow Expansion

Objectives:
- Improve dispatch, field logistics, customer portal, and inventory workflows using Phase 1 foundations.

Deliverables:
- Offline mutation queue for job execution evidence and checklist updates.
- Subcontractor profile and scoped assignment portal.
- Truck stock stocktake, reservation, usage, and conflict review.
- Low-stock trigger to draft purchase order.
- Customer media gallery over portal-visible artifacts.
- Multi-channel booking intake lead queue.
- Route optimization preview with no automatic apply.

Acceptance:
- Idempotent offline sync.
- Subcontractors cannot access unassigned work.
- Supplier POs are draft-only.
- Booking intake uses shared availability validators.
- Route optimization is preview-only.

## Phase 3: Provider Integrations Beta

Objectives:
- Add external systems through BYOG or provider-approved adapters while preserving truthful readiness.

Deliverables:
- Accounting sync connectors with export/reconciliation state.
- SMS provider readiness and consent-based automation.
- Supplier catalogue lookup for selected UK wholesalers.
- Map/routing provider integration for route previews.
- Weather advisory snapshots for job/site risk.
- Hardware-neutral telemetry bridge with one non-proprietary beta adapter.

Acceptance:
- Every provider has setup-needed/degraded/ready states.
- Webhooks validate signatures and dedupe events.
- Provider IDs are masked in UI.
- Telemetry UI reads rollups only.
- No proprietary Titan/ActivGuard behavior regresses.

## Phase 4: Advanced Enterprise Automation

Objectives:
- Add higher-value automation only after provider and audit foundations are stable.

Deliverables:
- Customer live ETA with expiring share sessions.
- Compliance packs for UK workflows.
- GDPR data subject export/delete workflow.
- Supplier order submission after approval.
- Predictive maintenance from telemetry rollups.
- Route optimization apply workflow with dispatcher approval.
- CIS verification and finance export.

Acceptance:
- Live tracking uses consent and expires.
- Compliance packs are versioned and reviewable.
- GDPR export excludes secrets and token material.
- Supplier order submission is approval-gated and idempotent.
- Predictive maintenance is advisory until accuracy is proven.

## Phase 5: Scale and Governance

Objectives:
- Harden enterprise functionality for larger tenants, parent companies, and franchises.

Deliverables:
- Enterprise dashboards over aggregate projections.
- Cross-company policy grants with explicit scope.
- Telemetry retention/partitioning and backpressure controls.
- Immutable audit export with hash verification.
- Performance/load tests for high-volume telemetry, booking intake, and route optimization.
- Admin rollout dashboards for feature readiness.

Acceptance:
- No unscoped cross-company query paths.
- Large telemetry tenants do not degrade core app latency.
- Audit exports are complete and tamper-evident.
- Feature rollout can be disabled per tenant/provider without data loss.

## MVP vs Later-Phase Summary

MVP:
- RBAC compatibility layer.
- Audit ledger.
- Managed assets and QR codes.
- Offline read packets, then limited mutation sync.
- Payment/accounting readiness and manual export.
- Supplier PO drafts.
- Enterprise aggregate reporting.

Later:
- Raw telemetry ingestion at scale.
- Predictive maintenance.
- Customer live tracking.
- Automatic route apply.
- Supplier order submission.
- SMS automations.
- CIS payment automation.
- Parent-company detail drilldown.

## Validation Plan by Phase

Every phase:

```sh
bash ./scripts/healthcheck.sh
bash ./scripts/production-readiness-check.sh
bash ./scripts/validate-e2e-stable.sh
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:verify-subscription-prices'
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:sync-job-products'
```

Additional phase-specific validation:
- Phase 1: RBAC compatibility, QR token masking, aggregate-only enterprise views.
- Phase 2: offline idempotency, subcontractor isolation, booking intake validation, PO draft-only.
- Phase 3: provider contract tests, webhook signature tests, telemetry load tests.
- Phase 4: GDPR export/delete tests, live tracking expiry, supplier submission idempotency.
- Phase 5: cross-company query audits, telemetry retention tests, audit export verification.
