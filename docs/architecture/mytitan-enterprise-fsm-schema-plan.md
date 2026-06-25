# MyTitan Enterprise FSM Schema Plan

Status: implementation planning
Principles: additive migrations, feature flags off by default, `Company` as hard tenant boundary, no Stripe mutation, and no raw secret/provider ID exposure.

## Migration Strategy

1. Add tables and nullable references first.
2. Backfill only from tenant-scoped existing records.
3. Add indexes after verifying expected query patterns.
4. Enable write paths behind flags.
5. Enable read UI after tenant-scoped API tests pass.
6. Never drop or repurpose existing billing, job, booking, quote, inventory, or integration columns during MVP.

## Naming and Tenant Scope

- Use `tenantId` for new tables and reference `Company(id)`.
- Keep existing `companyId` fields unchanged.
- Every table that stores tenant business data must index `tenantId`.
- Public/opaque tokens must store hashes, not raw token values.
- External provider references should be masked in UI and encrypted or stored as provider-safe opaque values.

## Phase 1 MVP Tables

### Job-Sheet Estimates

Preferred reuse:
- `Quote`
- `QuoteLineItem`
- `JobLineItem`
- `RevenueCollectionTask`
- `JobActivity`
- `AuditEvent`

Optional additive fields:
- `Quote.sourceContext` text or enum: `REVENUE`, `JOB_SHEET`, `CUSTOMER_PORTAL`.
- `Quote.conversionIdempotencyKey` text unique per tenant if conversion needs stronger idempotency.
- `JobLineItem.sourceQuoteLineItemId` nullable relation.

Indexes:
- `Quote(tenantId, jobId, status, createdAt)`
- `Quote(tenantId, sourceContext, createdAt)` if `sourceContext` is added.

Rollback:
- Hide job-sheet estimate UI and stop conversion endpoint writes.
- Existing quote data remains valid.

### Tenant-Owned Payment Providers

Proposed tables:

`TenantPaymentProviderAccount`
- `id`
- `tenantId`
- `provider`
- `status`
- `scope`
- `displayName`
- `credentialRouteId`
- `maskedExternalAccountRef`
- `lastVerifiedAt`
- `lastErrorCategory`
- `metadataJson`
- `createdByUserId`
- `updatedByUserId`
- timestamps

`CustomerPaymentIntent`
- `id`
- `tenantId`
- `customerId`
- `jobId`
- `quoteId`
- `providerAccountId`
- `status`
- `amountCents`
- `currency`
- `maskedProviderIntentRef`
- `checkoutUrlHash`
- `expiresAt`
- `metadataJson`
- timestamps

`CustomerPaymentEvent`
- `id`
- `tenantId`
- `paymentIntentId`
- `provider`
- `eventId`
- `eventType`
- `status`
- `sanitizedPayloadJson`
- `receivedAt`
- `processedAt`
- timestamps

Constraints/indexes:
- Unique provider event id: `(provider, eventId)`.
- Index customer payment lookup: `(tenantId, customerId, createdAt)`.
- Index reconciliation: `(tenantId, status, createdAt)`.

Rollback:
- Disable `tenant_payment_provider_v2`.
- Customer payment API returns setup-needed guidance.
- Keep events for audit/reconciliation.

### Inventory and Truck Stock

Preferred reuse:
- `InventoryLocation`
- `InventoryStock`
- `JobPart`
- `StockMovement`
- `StockPurchaseOrder`

Additive fields:
- `InventoryLocation.assignedUserId` nullable, for van/truck owner.
- `InventoryLocation.vehicleLabel` nullable.
- `StockMovement.idempotencyKey` nullable with unique `(tenantId, idempotencyKey)` where present.
- `JobPart.sourcePacketId` nullable later for offline sync.

Indexes:
- `InventoryLocation(tenantId, kind, assignedUserId, active)`
- `StockMovement(tenantId, idempotencyKey)`

Rollback:
- Hide truck-stock filters and job-sheet part usage controls.
- Existing stock remains in normal inventory.

### RBAC and Immutable Audit

Proposed tables:

`AccessPolicy`
- `id`
- `tenantId`
- `key`
- `name`
- `status`
- `metadataJson`
- timestamps

`PolicyPermission`
- `id`
- `policyId`
- `permission`
- `effect`
- `conditionsJson`

`PolicyScope`
- `id`
- `policyId`
- `scopeType`
- `scopeId`
- `metadataJson`

`UserPolicyAssignment`
- `id`
- `tenantId`
- `userId`
- `policyId`
- `assignedByUserId`
- `startsAt`
- `endsAt`
- timestamps

`AuditLedgerEntry`
- `id`
- `tenantId`
- `actorUserId`
- `action`
- `entityType`
- `entityId`
- `sanitizedDiffJson`
- `previousHash`
- `entryHash`
- `createdAt`

Constraints/indexes:
- Unique `AccessPolicy(tenantId, key)`.
- Index `UserPolicyAssignment(tenantId, userId, startsAt)`.
- Index `AuditLedgerEntry(tenantId, entityType, entityId, createdAt)`.

Rollback:
- Disable policy evaluator and continue existing role checks.
- Ledger remains append-only.

## Phase 2 Tables

### Customer Portal Gallery and ETA

Preferred reuse:
- `DocumentArtifact`
- `CustomerAccount`
- `CustomerApproval`
- `Booking.publicStatusToken`
- `WebsiteVisitEvent`

Proposed table:

`CustomerShareSession`
- `id`
- `tenantId`
- `customerId`
- `jobId`
- `bookingId`
- `tokenHash`
- `kind`
- `status`
- `expiresAt`
- `lastUsedAt`
- timestamps

Indexes:
- Unique `tokenHash`.
- `tenantId, customerId, status`.

Rollback:
- Disable gallery/ETA module and expire share sessions.

### Route Optimisation

Proposed tables:

`RouteOptimizationRun`
- `id`
- `tenantId`
- `provider`
- `status`
- `inputHash`
- `requestedByUserId`
- `summaryJson`
- timestamps

`RouteStopRecommendation`
- `id`
- `tenantId`
- `runId`
- `entityType`
- `entityId`
- `sequence`
- `etaStart`
- `etaEnd`
- `confidence`
- `reasonJson`

`ScheduleRecommendation`
- `id`
- `tenantId`
- `runId`
- `entityType`
- `entityId`
- `proposedChangesJson`
- `status`
- `appliedByUserId`
- `appliedAt`
- timestamps

Rollback:
- Disable route preview/apply endpoints.
- Recommendations remain historical.

### Offline Job Packets

Proposed tables:

`FieldSyncPacket`
- `id`
- `tenantId`
- `jobId`
- `principalType`
- `principalId`
- `version`
- `status`
- `payloadHash`
- `expiresAt`
- `downloadedAt`
- timestamps

`OfflineMutation`
- later-phase table after read-only packet beta
- `id`
- `tenantId`
- `packetId`
- `idempotencyKey`
- `mutationType`
- `status`
- `baseVersion`
- `sanitizedPayloadJson`
- `conflictJson`
- timestamps

Rollback:
- Expire packets and reject mutations.

### Compliance Packs

Proposed tables:

`CompliancePack`
- `id`
- `key`
- `jurisdiction`
- `tradeCategory`
- `version`
- `status`
- `reviewNotes`
- `publishedAt`
- timestamps

`CompliancePackRequirement`
- `id`
- `packId`
- `requirementKey`
- `entityType`
- `evidenceKind`
- `rulesJson`
- `severity`

`TenantCompliancePack`
- `id`
- `tenantId`
- `packId`
- `status`
- `enabledByUserId`
- timestamps

Rollback:
- Disable tenant pack mapping.
- Preserve historical exceptions/evidence.

## Phase 3 Tables

### Supplier Integrations

`SupplierIntegrationAccount`
- tenant-scoped provider account and readiness.

`SupplierCatalogueItem`
- tenant supplier SKU mapping, observed price, status, metadata.

`SupplierOrderSubmission`
- approved external order submission state, idempotency key, sanitized result.

Rollback:
- Disable supplier provider; manual PO remains.

### Accounting

`AccountingConnection`
- tenant provider, credential route, status.

`AccountingExportBatch`
- tenant, period, totals, status, idempotency key, sanitized result.

Rollback:
- Disable connector push; allow manual export if safe.

### Hardware Telemetry

`DeviceProvider`
- tenant/provider readiness and adapter metadata.

`DeviceIdentity`
- tenant-scoped device identity and assignment.

`TelemetryEvent`
- raw/normalized event pointer, bounded retention, tenant/device/provider/time index.

`TelemetryRollup`
- latest/period rollup for UI reads.

Rollback:
- Disable ingestion route; keep rollups inert and events under retention.

## Later-Phase Tables

- `ManagedAsset`
- `AssetQrToken`
- `AssetLifecycleEvent`
- `DataSubjectRequest`
- `RetentionPolicy`
- `RetentionActionLog`
- `SubcontractorProfile`
- `SubcontractorVerification`
- `ExternalWorkAssignment`
- `EnterpriseGroup`
- `EnterpriseCompanyMembership`
- `EnterpriseUserGrant`
- `EnterpriseMetricProjection`

## Migration Task Checklist

For every migration:

- Confirm all tenant business tables have `tenantId` or approved global scope.
- Add indexes for tenant + status/time lookup.
- Avoid non-null columns on existing populated tables unless default/backfill is safe.
- Avoid renaming or dropping existing columns in MVP.
- Add Prisma relation names clearly where existing models already have multiple relations.
- Add seed fixtures for enterprise tenant, branch, truck stock, quote, payment setup-needed state, and packet eligibility.
- Run `npx prisma migrate deploy` in container during release validation.

## Schema Review Gates

- Payment tables reviewed against billing boundary map.
- Offline tables reviewed against forbidden packet fields.
- Telemetry tables reviewed against ActivGuard isolation and retention.
- RBAC tables reviewed against legacy role compatibility.
- Multi-entity tables reviewed against cross-tenant query risk.
