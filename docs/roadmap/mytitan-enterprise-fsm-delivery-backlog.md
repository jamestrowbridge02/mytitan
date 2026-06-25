# MyTitan Enterprise FSM Delivery Backlog

Status: implementation-ready planning backlog
Priority order follows the MVP scope: job-sheet estimates, tenant-owned payments, inventory/truck stock, customer portal/live tracking foundation, RBAC/audit hardening, route optimisation bridge, offline job packets, and template/compliance expansion.

## Backlog Conventions

- Priority: P0 must ship before enterprise beta, P1 is MVP, P2 is later-phase.
- Story IDs are stable planning identifiers, not issue numbers.
- Every epic includes schema/API/security/test/rollout/rollback/dependency/risk notes.
- No story may mutate Stripe, enable job-pack checkout, weaken tenant isolation, or bypass provider readiness.

## Phase 0: Guardrails and Contracts

### Epic E0.1: Enterprise Feature-Flag and Release Guardrails

User stories:
- E0.1-S1: As platform admin, I can see whether enterprise flags are off, beta, or enabled without seeing secrets.
- E0.1-S2: As an engineer, I can disable any enterprise feature globally or by tenant without schema rollback.

Technical tasks:
- Define feature flag keys from MVP scope in tenant settings or a dedicated feature registry.
- Add ADRs for payment boundary, telemetry bridge, offline packets, RBAC compatibility, and multi-entity projections.
- Add a release checklist that blocks Stripe mutation, job-pack checkout enablement, and unscoped cross-tenant access.

Schema/API impacts:
- Prefer additive flag metadata; avoid changing existing entitlement semantics.

Security/RBAC impacts:
- Platform-admin view is presence/status only; no raw env, secret, or private host display.

Test coverage:
- Feature flag defaults off.
- Disabled API returns `FEATURE_DISABLED` or setup-needed state.

Rollout gates:
- All flags default off in production.
- Existing stable validator remains green.

Rollback plan:
- Disable flag; keep tables inert.

Dependencies:
- Current tenant settings and feature guard patterns.

Risks:
- Flag drift across app/API; mitigate with one registry.

### Epic E0.2: Provider Contract Harness

User stories:
- E0.2-S1: As an engineer, I can add payment, supplier, map, SMS, accounting, or telemetry providers behind a readiness contract.
- E0.2-S2: As platform admin, I can verify provider readiness without exposing credentials.

Technical tasks:
- Define provider states: `setup_needed`, `verifying`, `ready`, `degraded`, `disabled`.
- Define masked diagnostic shape and webhook idempotency contract.
- Create contract test templates for signature verification, dedupe, and redaction.

Schema/API impacts:
- Provider-specific tables reference encrypted credential routes rather than storing secrets directly.

Security/RBAC impacts:
- Provider diagnostics require admin/platform access and return sanitized metadata only.

Test coverage:
- Contract tests for unknown provider rejection and sanitized error payloads.

Rollout gates:
- No provider marked ready without verification evidence.

Rollback plan:
- Disable provider route and leave credentials encrypted/inactive.

Dependencies:
- Existing integrations credential and orchestration model.

Risks:
- Fake readiness; mitigate with required verification timestamps.

## Phase 1: MVP Foundations

### Epic E1.1: Job-Sheet Estimates and Quote Conversion

User stories:
- E1.1-S1: As an operator, I can build an estimate from the job sheet using line items and tax.
- E1.1-S2: As a customer, I can approve or decline an estimate through existing customer approval surfaces.
- E1.1-S3: As finance, I can convert an approved estimate into job line items without rekeying totals.

Technical tasks:
- Add job-sheet estimate panel using existing `Quote` and `QuoteLineItem`.
- Add quote-to-job-line-item conversion service with idempotency.
- Add timeline/audit events for estimate create, send, approve, decline, and convert.
- Ensure job totals and quote totals use shared money formatting and tax calculation helpers.

Schema/API impacts:
- Use existing `Quote`, `QuoteLineItem`, `JobLineItem`, `RevenueCollectionTask`; add only metadata fields if needed for conversion source.
- API: extend quote endpoints with job-sheet context and conversion idempotency key.

Security/RBAC impacts:
- Quote create/convert requires owner/admin/dispatcher or finance policy depending on action.
- Customer approval routes stay customer-scoped.

Test coverage:
- Quote totals preserved on conversion.
- Declined quote cannot be converted.
- Viewer/technician cannot convert estimates.
- Customer only sees their own estimate.

Rollout gates:
- `enterprise_job_sheet_estimates` enabled for one tenant after focused E2E passes.

Rollback plan:
- Hide estimate panel and disable conversion endpoint; existing quotes remain accessible through revenue surface.

Dependencies:
- Revenue module, customer approvals, job line items, audit service.

Risks:
- Duplicate conversion; mitigate with idempotency and conversion status.

### Epic E1.2: Tenant-Owned Payment Provider Expansion

User stories:
- E1.2-S1: As an owner, I can configure a tenant-owned payment provider and see readiness.
- E1.2-S2: As a customer, I receive setup-needed guidance if the tenant provider is not ready.
- E1.2-S3: As platform admin, I can verify MyTitan Stripe remains SaaS/job-pack only.

Technical tasks:
- Add payment provider readiness model and masked settings UI.
- Add customer payment intent model with setup-needed state by default.
- Add provider boundary tests proving no MyTitan Stripe checkout is created for customer payments.
- Add webhook receipt model or reuse integration receipt pattern for tenant provider events.

Schema/API impacts:
- Add `TenantPaymentProviderAccount`, `CustomerPaymentIntent`, `CustomerPaymentEvent`.
- API: `/payment-providers`, `/customer-payments/status`, provider webhook route using opaque route ID.

Security/RBAC impacts:
- Provider setup owner/admin only; finance can view readiness and reconciliation.
- Provider references masked; secrets encrypted; raw IDs hidden from normal users.

Test coverage:
- Missing provider returns setup-needed.
- Tenant provider event updates only matching tenant.
- MyTitan Stripe checkout helper is not called.
- Raw provider IDs are masked in UI/API.

Rollout gates:
- `tenant_payment_provider_v2` off until provider verification and boundary E2E pass.

Rollback plan:
- Disable flag; payment routes return existing guidance; preserve event records.

Dependencies:
- Existing payment readiness, public payment-status route, integration credential encryption.

Risks:
- Customer-money boundary breach; mitigate with separate models and regression tests.

### Epic E1.3: Inventory and Truck Stock MVP

User stories:
- E1.3-S1: As a technician, I can see reserved parts and use stock from my van.
- E1.3-S2: As inventory manager, I can see low stock by truck, branch, or warehouse.
- E1.3-S3: As finance, I can see used part cost and sale value on the job.

Technical tasks:
- Extend inventory location UI to support truck/van assignment.
- Add job-sheet part reservation/usage actions backed by `JobPart` and `StockMovement`.
- Add low-stock trigger to create draft PO only.
- Add idempotency key to stock movement path for future offline replay.

Schema/API impacts:
- Prefer existing `InventoryLocation`, `InventoryStock`, `JobPart`, `StockMovement`, `StockPurchaseOrder`.
- Add movement idempotency field if absent.
- API: extend inventory/job parts endpoints with truck stock filters.

Security/RBAC impacts:
- Technicians can use assigned job parts only.
- Inventory management owner/admin/dispatcher; finance read-only for costs if policy allows.

Test coverage:
- One stock movement per idempotency key.
- Technician cannot use unassigned truck stock.
- Low-stock creates draft PO, not supplier submission.

Rollout gates:
- `truck_stock_mvp` enabled after stock reservation tests and mobile layout checks.

Rollback plan:
- Disable job-sheet stock actions; existing inventory records remain.

Dependencies:
- Inventory module, job detail UI, location context.

Risks:
- Negative stock or duplicate usage; mitigate with transaction and idempotency.

### Epic E1.4: RBAC Compatibility and Immutable Audit Foundation

User stories:
- E1.4-S1: As an owner, I can keep current team roles working after enterprise policies are introduced.
- E1.4-S2: As auditor, I can review immutable enterprise audit entries.
- E1.4-S3: As platform admin, I can diagnose denied access without seeing tenant secrets.

Technical tasks:
- Add policy evaluator behind existing role checks.
- Map existing roles to default policy bundles.
- Add append-only audit ledger for enterprise-sensitive actions.
- Keep safe error logs separate from immutable ledger.

Schema/API impacts:
- Add `AccessPolicy`, `PolicyPermission`, `PolicyScope`, `UserPolicyAssignment`, `AuditLedgerEntry`.
- API: `/access-policies`, `/audit-ledger/export` later; MVP can be internal API only.

Security/RBAC impacts:
- Default deny for enterprise features.
- Existing role behavior preserved.
- Ledger export owner/admin/platform-restricted.

Test coverage:
- Legacy role matrix unchanged.
- Policy denial audited.
- Safe error cleanup cannot delete ledger entries.

Rollout gates:
- `enterprise_rbac_policies` and `immutable_audit_ledger` initially shadow-mode only.

Rollback plan:
- Disable policy evaluator and fall back to current role permissions; ledger stays append-only.

Dependencies:
- `assertPermission`, `RolesGuard`, audit service.

Risks:
- Breaking access; mitigate with shadow evaluation and comparison logs.

## Phase 2: MVP Workflow Expansion

### Epic E2.1: Customer Portal Gallery and Coarse ETA

User stories:
- E2.1-S1: As a customer, I can view portal-visible media and documents in a gallery.
- E2.1-S2: As a customer, I can see coarse job/booking status and ETA.
- E2.1-S3: As an owner, I can audit what was shared.

Technical tasks:
- Add gallery grouping over portal-visible artifacts.
- Add ETA/status summary using booking/job schedule, not raw GPS.
- Add expiring share-session model disabled by default for live tracking later.
- Add portal analytics sanitization tests for new paths.

Schema/API impacts:
- Use existing `DocumentArtifact`, customer workspace, public booking status.
- Add `CustomerShareSession` if needed for expiring ETA links.

Security/RBAC impacts:
- Customer access scoped to customer account or opaque public token.
- Private artifacts excluded by policy.

Test coverage:
- Non-portal media hidden.
- Expired share session returns no live data.
- Tokens sanitized in logs/traffic.

Rollout gates:
- `customer_portal_gallery_eta` enabled for beta tenant after portal tests pass.

Rollback plan:
- Hide gallery/ETA modules; keep current portal pages.

Dependencies:
- Customer workspace, artifacts, public status pages.

Risks:
- Private media exposure; mitigate with deny-by-default portal visibility.

### Epic E2.2: Route Optimisation Preview Bridge

User stories:
- E2.2-S1: As dispatcher, I can generate route suggestions before changing schedule.
- E2.2-S2: As dispatcher, I can apply selected recommendations explicitly.
- E2.2-S3: As owner, I can see recommendation rationale and audit.

Technical tasks:
- Add route optimization run service with internal heuristic provider.
- Add recommendation diff model for bookings/jobs.
- Add preview UI in calendar/scheduling.
- Add explicit apply endpoint that revalidates availability.

Schema/API impacts:
- Add `RouteOptimizationRun`, `RouteStopRecommendation`, `ScheduleRecommendation`.
- API: `/route-optimization/runs`, `/route-optimization/runs/:id/apply`.

Security/RBAC impacts:
- Dispatcher/admin only for apply.
- Technicians can view assigned route after apply only.

Test coverage:
- Preview creates no booking/job mutation.
- Apply revalidates stale slots.
- Rejected recommendations remain audit-visible.

Rollout gates:
- `route_optimization_preview` remains preview-only until stable.

Rollback plan:
- Disable route optimization endpoints and hide UI; no scheduling records deleted.

Dependencies:
- Scheduling service, booking availability validator, audit ledger.

Risks:
- Bad automatic scheduling; mitigated by preview-only MVP.

### Epic E2.3: Offline Job Packets

User stories:
- E2.3-S1: As technician, I can download a scoped packet for assigned work.
- E2.3-S2: As dispatcher, I can see packet status and expiry.
- E2.3-S3: As security admin, I can confirm packets exclude secrets and public tokens.

Technical tasks:
- Add packet generation service with allowed/forbidden field allowlist.
- Add packet version, expiry, and payload hash.
- Add local packet storage wrapper with logout wipe.
- Add read-only packet UI before mutation sync.

Schema/API impacts:
- Add `FieldSyncPacket`; later add `OfflineMutation`.
- API: `/field-sync/packets`, `/field-sync/packets/:id/download`.

Security/RBAC impacts:
- Technician can download assigned jobs only.
- No payment IDs, public tokens, provider IDs, or unassigned customer data.

Test coverage:
- Packet allowlist snapshot test.
- Cross-tenant and unassigned access denied.
- Logout clears local packet state.

Rollout gates:
- `offline_field_packets` read-only beta before any mutation queue.

Rollback plan:
- Expire all packets and reject downloads; clear local cache on next app load.

Dependencies:
- Technician queue, job execution record, PWA safety plan.

Risks:
- Sensitive offline persistence; mitigate with minimal packets and wipe hooks.

### Epic E2.4: Template and Compliance Pack Expansion

User stories:
- E2.4-S1: As owner, I can enable a versioned compliance pack for a trade.
- E2.4-S2: As technician, I see required evidence from the pack on relevant jobs.
- E2.4-S3: As manager, I see exceptions when required evidence is missing.

Technical tasks:
- Add compliance pack and requirement models.
- Map pack requirements to job-sheet templates and custom fields.
- Extend compliance exception sync for pack requirements.
- Add review status and safe copy to avoid legal-readiness claims.

Schema/API impacts:
- Add `CompliancePack`, `CompliancePackRequirement`, `TenantCompliancePack`.
- API: `/compliance-packs`, `/compliance-packs/:id/enable`.

Security/RBAC impacts:
- Owner/admin manage packs; technicians satisfy assigned job evidence only.

Test coverage:
- Missing pack-required evidence creates exception.
- Disabled pack does not affect jobs.
- Pack status shown as draft/reviewed/active truthfully.

Rollout gates:
- `compliance_packs_uk` off until reviewed pack content exists.

Rollback plan:
- Disable tenant pack mapping; preserve evidence and audit.

Dependencies:
- Job-sheet templates, custom fields, compliance service.

Risks:
- False compliance claims; mitigate with review status and disclaimers.

## Phase 3: Provider Integrations Beta

### Epic E3.1: Supplier Catalogue Lookup and PO Drafts

User stories:
- E3.1-S1: As inventory manager, I can look up supplier catalogue items from a verified BYOG supplier connection.
- E3.1-S2: As owner, I can create draft POs from low-stock triggers without submitting orders.

Technical tasks:
- Add supplier integration account readiness.
- Add catalogue item mapping and observed price status.
- Connect low-stock trigger to draft PO generation.

Schema/API impacts:
- `SupplierIntegrationAccount`, `SupplierCatalogueItem`; use existing PO tables.
- API: `/supplier-integrations`, `/supplier-integrations/catalogue/search`.

Security/RBAC impacts:
- Supplier credentials encrypted and owner/admin only.

Test coverage:
- Unverified supplier returns setup-needed.
- Draft PO only; no external submission.

Rollout gates:
- `supplier_catalogue_lookup` beta with one connector.

Rollback plan:
- Disable supplier lookup; manual PO remains.

Dependencies:
- Provider contract harness, inventory.

Risks:
- Wrong pricing/order; mitigate with observed price and approval.

### Epic E3.2: Accounting Export Connector Beta

User stories:
- E3.2-S1: As finance, I can export invoices/payments for an accounting period.
- E3.2-S2: As owner, I can see export status and retry safely.

Technical tasks:
- Add accounting connection readiness.
- Add export batch builder with idempotency.
- Add sanitized export download and connector handoff.

Schema/API impacts:
- `AccountingConnection`, `AccountingExportBatch`.
- API: `/accounting/exports`.

Security/RBAC impacts:
- Finance/admin scoped; customer PII minimized.

Test coverage:
- Duplicate export idempotent.
- Export excludes secrets/raw provider IDs.

Rollout gates:
- `accounting_sync` manual export before provider push.

Rollback plan:
- Disable connector push; keep downloadable export.

Dependencies:
- Revenue/payment events.

Risks:
- Duplicate accounting records; mitigate with export batch idempotency.

### Epic E3.3: Hardware Telemetry Bridge Beta

User stories:
- E3.3-S1: As owner, I can connect a non-proprietary telemetry provider without affecting Titan/ActivGuard.
- E3.3-S2: As dispatcher, I can see latest safe rollup, not raw event streams.

Technical tasks:
- Add device provider registry and route ID ingestion endpoint.
- Add event quarantine and rollup worker.
- Add adapter contract test for proprietary isolation.

Schema/API impacts:
- `DeviceProvider`, `DeviceIdentity`, `TelemetryEvent`, `TelemetryRollup`.
- API: `/telemetry/ingest/:routeId`, `/telemetry/rollups`.

Security/RBAC impacts:
- Location views require dispatch/admin policy and consent state.

Test coverage:
- Unknown provider quarantined.
- Rollups tenant-scoped.
- ActivGuard contract tests unaffected.

Rollout gates:
- `hardware_telemetry_bridge` beta with one non-proprietary provider.

Rollback plan:
- Disable ingestion route; retain quarantined events for retention window.

Dependencies:
- Provider harness, queue/backpressure design.

Risks:
- Telemetry volume/performance; mitigate with rollups and retention.

## Phase 4: Advanced Automation

### Epic E4.1: Live ETA, Supplier Submission, GDPR, CIS, Predictive Maintenance

User stories:
- As customer, I can open an expiring live ETA link.
- As inventory manager, I can submit approved POs to a supplier.
- As data protection owner, I can process export/delete requests.
- As finance, I can verify CIS subcontractors.
- As maintenance manager, I can see predictive maintenance suggestions from telemetry rollups.

Technical tasks:
- Add consented live share sessions over rollups.
- Add supplier order submission with approval and idempotency.
- Add data subject request workflow with legal hold exclusions.
- Add subcontractor verification domain with encrypted sensitive fields.
- Add advisory predictive maintenance rule engine.

Schema/API impacts:
- Extend Phase 1-3 tables; add `DataSubjectRequest`, `RetentionActionLog`, `SubcontractorProfile`, `SubcontractorVerification`.

Security/RBAC impacts:
- High-risk permissions for live tracking, CIS, GDPR, and supplier submission.

Test coverage:
- Live link expiry.
- Supplier submission idempotency.
- GDPR export excludes secrets.
- CIS sensitive fields masked.

Rollout gates:
- Feature-by-feature beta; no default-on until audited.

Rollback plan:
- Disable each automation; preserve audit and source records.

Dependencies:
- Stable Phase 1-3 foundations.

Risks:
- Legal/privacy exposure; mitigate with review gates.

## Phase 5: Scale and Governance

### Epic E5.1: Enterprise Group Reporting and Scale Hardening

User stories:
- As parent admin, I can view aggregate branch/franchise metrics.
- As franchise owner, I retain tenant-local data privacy.
- As platform admin, I can monitor rollout readiness by tenant without secrets.

Technical tasks:
- Build aggregate projections.
- Add enterprise grants and policy scopes.
- Add telemetry retention partitioning and backpressure dashboards.
- Add audit export hash verification.

Schema/API impacts:
- `EnterpriseGroup`, `EnterpriseCompanyMembership`, `EnterpriseUserGrant`, `EnterpriseMetricProjection`.
- API: `/enterprise-groups`, aggregate-only dashboards.

Security/RBAC impacts:
- No unscoped cross-company queries.
- Parent detail access requires explicit grant.

Test coverage:
- Parent aggregate-only access.
- Cross-company detail denied by default.
- Load tests for telemetry and projections.

Rollout gates:
- Enterprise beta tenants only after query audit.

Rollback plan:
- Disable group dashboards; tenant-local operation unaffected.

Dependencies:
- RBAC policy engine, audit ledger, projection jobs.

Risks:
- Cross-tenant leakage; mitigate with projection-only reads and grant tests.
