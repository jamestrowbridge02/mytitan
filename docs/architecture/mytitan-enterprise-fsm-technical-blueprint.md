# MyTitan Enterprise FSM Technical Specification Blueprint

Status: draft architecture blueprint
Scope: enterprise FSM, IoT/telematics, payments, quoting, scheduling, offline mobile, portals, compliance, integrations, RBAC, supplier integrations, and multi-entity support.

## Verified Current Architecture

MyTitan is a Dockerized NestJS/Prisma API, Next.js app, Next.js marketing site, Postgres, Redis, and nginx deployment. The current system already includes:

- Tenant root: `Company`
- Users/roles: `User`, role permissions, location memberships
- FSM core: `Job`, `Booking`, `Service`, `JobExecutionRecord`, `JobExecutionEvidence`, `JobActivity`, `JobReminder`
- Revenue: `Quote`, `QuoteLineItem`, `RevenueCollectionTask`, job line items, invoice/payment fields
- Customer surfaces: customer accounts, approvals, customer workspace, public job/booking status
- Inventory: `StockItem`, `StockSupplier`, `StockPurchaseOrder`, `StockPOLine`, `StockMovement`, `InventoryLocation`, `InventoryStock`, `JobPart`
- Compliance: workflow SLA policies/events and compliance exceptions
- Integrations: workspace/personal credentials, webhook receipts, orchestration events, API tokens
- Platform controls: platform-admin catalog, safe error logs, internal monitoring, billing dry-run scripts
- Analytics: first-party website visit events and tenant-safe summaries

The enterprise architecture must extend these foundations rather than duplicate them.

## Architecture Principles

- Tenant isolation first: every business record must be scoped by `tenantId` or `companyId`.
- Provider separation: MyTitan Stripe is only for SaaS subscription and job packs; tenant customer payments are BYOG.
- Hardware isolation: proprietary Titan/ActivGuard logic remains behind provider-specific adapters.
- Offline minimization: sync scoped work packets, not whole authenticated pages.
- Readiness truth: setup-needed, degraded, and partial states are product states, not errors to hide.
- Secret hygiene: never expose tokens, secrets, raw provider IDs, raw IPs, or private hosts in UI/logs.
- API-first extensibility: all enterprise modules have stable internal APIs before broad UI rollout.

## Target Domain Boundaries

| Domain | Existing Foundation | Enterprise Extension |
| --- | --- | --- |
| Revenue and payments | Quote, job totals, billing, payment collection readiness | Tenant payment provider abstraction, accounting sync, reconciliation |
| Hardware and telemetry | Vehicle fields, integrations | Device providers, telemetry gateway, rollups, asset signals |
| Field execution | Job execution record/evidence | Offline packet sync, subcontractor work packets |
| Scheduling | Calendar, capacity, booking slots | Route optimization runs and explainable recommendations |
| Customer portal | Customer workspace/public status | Galleries, live ETA, retention automations |
| Compliance | SLA and compliance exceptions | UK packs, GDPR workflows, weather advisories |
| Inventory | Stock, PO, locations, job parts | Truck stock sync, low-stock PO drafts, supplier connectors |
| Access control | Roles and permissions | Policy bundles, scope grants, immutable audit ledger |
| Enterprise org | Company and Location | Enterprise groups and aggregate projections |

## Database and Schema Impact Map

### Financial, Payments, Accounting

Add:
- `TenantPaymentProviderAccount`: tenant-owned provider readiness, encrypted credential route, status, last verified.
- `CustomerPaymentIntent`: tenant/customer/job/quote linkage, provider type, masked provider reference, amount, currency, state.
- `PaymentEvent`: signed webhook or manual event, idempotency key, status, sanitized metadata.
- `AccountingConnection`: provider, scope, readiness, encrypted credential reference.
- `AccountingExportBatch`: export state, period, totals, idempotency key, result summary.

Use existing:
- `Quote`, `QuoteLineItem`, `RevenueCollectionTask`, `JobLineItem`, `Job`, `TenantSubscription`, `JobCompletionPackPurchase`, `BillingCatalogOverride`.

Do not:
- Reuse `JobCompletionPackPurchase` or platform billing catalog for tenant customer payments.

### Hardware, Telematics, Assets

Add:
- `DeviceProvider`: tenant/provider config and readiness.
- `DeviceIdentity`: tenant-scoped hardware identity, provider key, status, assigned asset/user/vehicle.
- `TelemetryEvent`: bounded raw or normalized event pointer with tenant/device/provider/time indexes.
- `TelemetryRollup`: latest/period rollups for UI and scheduling.
- `ManagedAsset`: physical customer/fleet/site asset separate from existing `JobAsset`.
- `AssetQrToken`: opaque public-safe token hash, expiry, revocation.
- `AssetLifecycleEvent`: service, scan, inspection, warranty, telemetry-derived event.

Use existing:
- `Job.vehicleMake`, `vehicleModel`, `vehicleReg`, `JobAsset`, `JobExecutionEvidence`, `DocumentArtifact`, integrations.

Bridge:
- Proprietary Titan/ActivGuard providers must use dedicated adapters and contract tests.

### Dispatch, Offline, Subcontractors

Add:
- `FieldSyncPacket`: tenant, job, assigned principal, version, expires, payload hash.
- `OfflineMutation`: idempotency key, packet ID, mutation kind, version, conflict status.
- `SubcontractorProfile`: separate from customer/trade accounts.
- `SubcontractorVerification`: CIS/insurance/right-to-work state and encrypted evidence pointers.
- `ExternalWorkAssignment`: scoped grant for subcontractor job packets.

Use existing:
- `Job`, `Booking`, `User`, `JobExecutionRecord`, `JobExecutionEvidence`, `InventoryStock`, `JobPart`.

### Compliance and GDPR

Add:
- `CompliancePack`: jurisdiction, trade, version, review status.
- `CompliancePackRequirement`: required field/evidence/status rule.
- `DataSubjectRequest`: export/delete/restrict request state.
- `RetentionPolicy`: tenant/entity retention configuration.
- `RetentionActionLog`: action result, legal hold reason.
- `WeatherAdvisorySnapshot`: job/site-scoped advisory, provider, retention expiry.

Use existing:
- `WorkflowSlaPolicy`, `WorkflowSlaEvent`, `ComplianceException`, `AuditEvent`, `DocumentArtifact`.

### Routing and Schedule Optimization

Add:
- `RouteOptimizationRun`: tenant, input hash, provider, status, summary.
- `RouteStopRecommendation`: job/booking, sequence, ETA, confidence, reason.
- `ScheduleRecommendation`: proposed assignment/time change, diff, accepted/rejected state.

Use existing:
- `Booking`, `Job`, `Location`, `StaffAvailability`, `TechnicianAvailability`, `BlackoutDate`, `TechScheduleSetting`.

### Supplier Integrations

Add:
- `SupplierIntegrationAccount`: supplier/provider readiness and credential route.
- `SupplierCatalogueItem`: tenant supplier SKU mapping, observed price, status.
- `SupplierOrderSubmission`: approved PO submission state and idempotency.

Use existing:
- `StockSupplier`, `StockPurchaseOrder`, `StockPOLine`, `StockItem`, `InventoryStock`.

### RBAC and Multi-Entity

Add:
- `AccessPolicy`, `PolicyPermission`, `PolicyScope`, `UserPolicyAssignment`.
- `AuditLedgerEntry`: append-only, hash chained or export-hash capable.
- `EnterpriseGroup`, `EnterpriseCompanyMembership`, `EnterpriseUserGrant`.
- `EnterpriseMetricProjection`: aggregate-only cross-company reporting.

Use existing:
- `User.role`, `LocationMembership`, `AuditEvent`, `Company`, `Location`.

## API Impact Map

### New API Groups

- `/payment-providers`: tenant-owned payment readiness, verification, masked status.
- `/customer-payments`: create payment intent, status, signed webhook handling.
- `/accounting`: connection readiness, export batch creation, export download.
- `/devices/providers`: hardware provider setup and readiness.
- `/telemetry/ingest/:routeId`: provider webhook ingestion; route IDs only, no raw secrets in path.
- `/telemetry/rollups`: tenant-safe latest location/asset signal summaries.
- `/field-sync/packets`: create/download assigned offline packet.
- `/field-sync/mutations`: submit idempotent offline mutation batch.
- `/subcontractors`: profile, verification, assignment grants.
- `/assets`: managed asset CRUD, QR token issue/revoke/resolve.
- `/route-optimization`: create preview run, list recommendations, apply selected changes.
- `/compliance-packs`: enable/version compliance packs.
- `/data-subject-requests`: GDPR export/delete workflow.
- `/supplier-integrations`: readiness, catalogue lookup, PO draft/submission.
- `/enterprise-groups`: group membership, aggregate metrics, scoped grants.
- `/access-policies`: granular RBAC policies and assignments.

### API Rules

- All authenticated routes require `JwtAuthGuard` and tenant scoping.
- Platform-admin routes cannot return tenant secrets, raw provider IDs, SMTP values, or private hosts.
- Public token routes accept opaque tokens only and sanitize all logs/analytics paths.
- Webhooks must validate signatures, dedupe event IDs, and record sanitized receipts.
- Mutating APIs must emit audit or ledger events with actor, tenant, entity, and sanitized diff.

## Mobile and Offline Impact Map

MVP offline is not a service worker for authenticated pages. It is a field packet sync layer.

Allowed offline packet contents:
- Job core details needed for execution.
- Assigned technician/subcontractor scope.
- Required form/checklist fields.
- Customer contact subset required for visit.
- Parts reserved for the job.
- Existing portal-safe instructions.

Forbidden offline packet contents:
- Payment checkout/session IDs.
- Raw public tokens.
- Customer workspace tokens.
- Provider secrets or raw external IDs.
- Unassigned jobs/customers.
- Full tenant user lists.

Conflict handling:
- Each packet has a server version and expiry.
- Each mutation has an idempotency key.
- Conflicts produce a dispatcher/operator review item, not silent overwrite.

## Security, RBAC, and GDPR Impact Map

### RBAC

Granular RBAC must be additive:
- Keep existing roles as compatibility bundles.
- Add policy scopes for location, job, booking, customer, asset, inventory, finance, compliance, integration, and enterprise group.
- Support deny-by-default for new enterprise features.

### GDPR

Required controls:
- Data subject export.
- Deletion/restriction workflow with legal retention exclusions.
- Retention policy by entity class.
- No raw IP display.
- No secret-bearing URL storage.
- Sanitized public tokens in logs and analytics.
- Explicit consent/policy checks for SMS and live tracking.

### Audit

Use append-only ledger for:
- Policy changes.
- Provider credential lifecycle.
- Payment state transitions.
- Offline mutation apply/conflict.
- Subcontractor verification.
- Supplier order submission.
- Enterprise group grants.

Keep safe error logs separate because they are operational and can be clearable.

## Billing and Payment Boundary Map

| Flow | Owner | Allowed Provider | Notes |
| --- | --- | --- | --- |
| MyTitan SaaS subscription | MyTitan | MyTitan Stripe | Existing billing path |
| MyTitan job-completion packs | MyTitan | MyTitan Stripe | Remains gated by readiness and confirmation flag |
| Customer invoice payment | Tenant | Tenant BYOG provider | Never MyTitan Stripe |
| Booking deposits | Tenant | Tenant BYOG provider | No MyTitan fallback |
| Supplier payments | Tenant | Tenant accounting/bank workflow | No automatic money movement in MVP |
| Subcontractor payments/CIS | Tenant | Accounting/export workflow | Verification and deductions only in MVP |

## Telemetry and Proprietary Hardware Protection Map

Protected boundaries:
- Proprietary Titan/ActivGuard device identity, event semantics, alerting, and readiness must not be reimplemented in generic code.
- Open telemetry adapters must write through a normalized bridge.
- Raw provider payloads must be bounded, encrypted where necessary, and retained separately from UI rollups.

Controls:
- Provider adapter registry with explicit capabilities.
- Per-provider contract tests.
- Backpressure and quarantine queues.
- Rollup-only UI reads.
- Feature flags per provider and tenant.
- No customer live tracking from raw telemetry; use safe ETA/share sessions.

## Validation and Test Strategy

### Required Test Layers

- Unit tests for parsing, masking, policy evaluation, idempotency, and sanitizer helpers.
- Integration tests for tenant scoping across every new API group.
- E2E tests for role access, mobile/tablet readability, billing boundary, portal safety, and offline conflict flows.
- Contract tests for hardware, payment, accounting, supplier, SMS, map, and weather providers.
- Load tests for telemetry ingestion, route optimization, and visit/analytics aggregation.
- Migration tests for additive schema rollout and rollback readiness.

### Baseline Commands

Keep the existing release proof commands green:

```sh
bash ./scripts/healthcheck.sh
bash ./scripts/production-readiness-check.sh
bash ./scripts/validate-e2e-stable.sh
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:verify-subscription-prices'
docker exec -w /app mytitan_api /bin/sh -lc 'npm run billing:sync-job-products'
```

Do not run mutation-capable Stripe commands outside explicit controlled canaries.

## Rollout and Feature-Flag Strategy

Feature flags should gate:
- `enterprise_rbac_policies`
- `offline_field_packets`
- `subcontractor_portal`
- `tenant_payment_provider_v2`
- `accounting_sync`
- `hardware_telemetry_bridge`
- `customer_live_eta`
- `route_optimization_preview`
- `supplier_catalogue_lookup`
- `supplier_order_submission`
- `managed_assets_qr`
- `compliance_packs_uk`
- `gdpr_request_workflows`
- `enterprise_group_reporting`

Rollout stages:
1. Schema and read-only API behind disabled flags.
2. Internal tenant beta with fixture data.
3. Single-tenant beta with monitoring.
4. Multi-tenant limited rollout.
5. Default-on only after validation, support runbooks, and rollback plan are stable.

## MVP vs Later Phase Recommendation

MVP:
- Tenant-owned payment/accounting bridge status and exports.
- Offline job packet download/sync for technicians.
- Managed assets with QR token lifecycle.
- Supplier PO draft generation.
- Granular RBAC compatibility layer.
- Enterprise aggregate reporting.

Later:
- Raw telemetry ingestion at scale.
- Predictive maintenance.
- Precise customer live tracking.
- Automatic route dispatch.
- Supplier order submission.
- SMS automation.
- CIS payment deduction automation.
- Parent-company cross-tenant detail drilldown.
