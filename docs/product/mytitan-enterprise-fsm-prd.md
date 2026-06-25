# MyTitan Enterprise FSM PRD

Status: draft for implementation planning
Source brief: user-supplied FSM, IoT, payments, scheduling, offline mobile, portal, compliance, integrations, RBAC, supplier, and multi-entity requirements. The referenced file `docs/feature-requests/fsm-iot-enterprise-gap-analysis.md` was not present in this checkout, so this PRD uses the supplied brief plus verified repository state.

## Executive Summary

MyTitan already has a strong FSM core: tenant-scoped jobs, bookings, quotes, revenue tasks, customer workspace, public booking/status pages, service plans, inventory, purchase orders, locations, compliance exceptions, SLA policies, BYOG integrations, platform-admin billing controls, internal monitoring, and role-based guards. The enterprise roadmap should therefore extend the existing operating system rather than introduce parallel workflows.

The target product is an enterprise field-service platform for UK service operators with hardware-neutral telemetry, tenant-owned customer payments, offline-resilient mobile execution, multi-entity operations, supplier purchasing, compliance governance, and customer self-service. The architecture must preserve proprietary Titan/ActivGuard stability by isolating open telematics from existing hardware logic, preserve MyTitan Stripe as SaaS billing/job-pack only, and keep customer/operator payment flows owned by the tenant.

## Product Goals

- Expand MyTitan from service-business OS into enterprise FSM for branch, franchise, subcontractor, fleet, and asset-heavy operators.
- Add open, hardware-neutral IoT/telematics without destabilizing proprietary Titan/ActivGuard pipelines.
- Make quoting, payments, scheduling, inventory, compliance, portals, and supplier procurement feel like one workflow.
- Support offline-first field execution without caching secrets, payment data, customer portals, or unsafe tenant data.
- Preserve tenant isolation, RBAC, auditability, GDPR retention/export, validation stability, and truthful readiness.

## Non-Goals

- Do not route customer or operator money through MyTitan Stripe.
- Do not mutate Stripe products/prices automatically.
- Do not replace proprietary Titan/ActivGuard ingestion with an open hardware path.
- Do not claim global uptime from internal health snapshots.
- Do not implement third-party analytics, cookie tracking, or personal profiling by default.
- Do not make offline mode a broad authenticated page cache.

## Personas

- Owner/operator: wants profitable work, simple controls, payments clarity, and trusted compliance.
- Dispatcher: needs schedule, route, stock, and technician visibility.
- Technician: needs offline-ready jobs, forms, media, parts, and signatures.
- Finance user: needs quote, invoice, payment, CIS, and accounting handoff accuracy.
- Customer: needs booking, status, approvals, documents, and safe payment handoff.
- Subcontractor: needs scoped job packets, compliance evidence, and limited portal access.
- Platform admin: needs safe catalog, billing, uptime, and integration readiness controls.
- Enterprise admin: needs branch/franchise scope, role governance, audit exports, and integration policy.

## Stage 1 Audit Method

Every category below uses the required 3-point gate:

1. Current State Verification: whether MyTitan already has a functional equivalent.
2. Legacy & Proprietary Conflict Mapping: exact schemas, APIs, UI, ingestion, billing, or hardware logic that could conflict.
3. Regression Risk Check: performance, security, telemetry, billing, scheduling, tenant isolation, and validation risks.

If a requested capability conflicts with current MyTitan or proprietary Titan/ActivGuard boundaries, the recommendation is bridge, isolate, feature-flag, or phase rather than implement directly.

## Category 1: Financial Infrastructure, Quoting, Payments, Billing, Accounting Sync

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Quotes exist via `Quote`, `QuoteLineItem`, quote approval/decline/convert flows, revenue tasks, job line items, invoice fields, payment links, payment receipts, and finance surfaces.
- SaaS billing and job packs are separate from tenant customer payments.
- BYOG payment readiness exists and customer payment messaging explicitly refuses MyTitan Stripe fallback.
- Platform catalog overrides and dry-run subscription price verification exist.

Conflicts:
- `Job.paymentCheckoutSessionId`, `paymentLinkUrl`, `paymentReceiptUrl`, billing controllers, public payment-status routes, platform catalog override history, and Stripe webhook tests are sensitive boundary points.
- Accounting sync must not reuse MyTitan Stripe customer/subscription objects for tenant customer money.

Regression risks:
- High risk of double-recording payment status, exposing Stripe IDs, or activating tenant billing incorrectly.
- Accounting exports can leak customer data if not tenant-scoped and role-limited.

Resolution:
- Extend finance with a `PaymentProviderAccount`, `CustomerPaymentIntent`, `AccountingExportBatch`, and `AccountingSyncState` abstraction.
- Keep MyTitan Stripe for subscriptions/job packs only.
- Tenant payment provider integrations must be BYOG, verified, and feature-flagged per tenant.

### Technical Architecture & Data Flow

Quote -> customer approval -> job conversion -> tenant payment provider -> signed webhook -> payment event -> invoice/payment status -> accounting export. All provider IDs are stored encrypted or masked and surfaced only as safe status labels.

### User Stories & Jobs-To-Be-Done

- As finance, I can issue a quote and convert it after approval without rekeying line items.
- As an owner, I can connect my business payment provider and see whether customer payments are ready.
- As a customer, I can pay through the business payment setup, not MyTitan billing.
- As finance, I can export approved invoices and payments to accounting with a reconciliation trail.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Tenant-owned payments and accounting sync
  Scenario: Customer payment never uses MyTitan Stripe
    Given a tenant has no verified customer payment provider
    When a customer opens an invoice payment action
    Then MyTitan shows customer payment setup guidance
    And no MyTitan Stripe checkout session is created

  Scenario: Quote conversion preserves totals
    Given an approved quote with line items and tax
    When an operator converts it to a job
    Then the job line items match the quote totals
    And the conversion is audited for the tenant
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| MyTitan Stripe used for customer funds | Critical | Provider boundary tests, separate models, no shared checkout helper |
| Raw provider IDs exposed | High | Masked display and encrypted storage |
| Accounting duplicate export | Medium | Idempotency keys and export batch state |

## Category 2: Hardware Neutrality, Fleet Tracking, BLE/Barcode Assets, Telematics, Predictive Maintenance

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Jobs store vehicle fields and job assets; inventory has stock and locations; integrations have BYOG credential/orchestration infrastructure.
- No verified open telematics, BLE, barcode, or predictive maintenance domain exists.
- Proprietary Titan/ActivGuard logic is not represented as a stable public module in this checkout, so it must be treated as protected external/proprietary capability.

Conflicts:
- Any new telemetry ingestion could conflict with proprietary ActivGuard hardware semantics, event cadence, device identity, or alert logic.
- High-volume telemetry can overload Postgres and tenant dashboards if stored in core job tables.

Regression risks:
- Performance degradation from raw GPS/sensor ingestion.
- Security risk from device tokens, serials, location traces, and personal tracking.
- Tenant isolation risk if device identity is globally unique without tenant scoping.

Resolution:
- Use a hardware-neutral bridge: `DeviceProvider`, `DeviceIdentity`, `TelemetryEvent`, `TelemetryRollup`, and `AssetSignal`.
- Keep proprietary Titan/ActivGuard adapters behind isolated provider boundaries and feature flags.
- Store raw high-volume telemetry in bounded partitions or object storage, with rollups in Postgres.

### Technical Architecture & Data Flow

Device/provider webhook or polling adapter -> ingestion gateway -> provider-specific normalizer -> tenant/device resolver -> immutable telemetry event stream -> rollup worker -> FSM surfaces. Prediction uses rollups only until accuracy and privacy are validated.

### User Stories & Jobs-To-Be-Done

- As a dispatcher, I can see the latest safe vehicle/technician location where consent and policy permit.
- As an asset manager, I can scan a barcode or BLE tag and link it to a job, stock item, or customer asset.
- As an owner, I can connect non-Titan hardware without weakening Titan/ActivGuard reliability.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Hardware-neutral telemetry bridge
  Scenario: Unknown provider event is isolated
    Given an unverified hardware provider sends telemetry
    When the ingestion endpoint receives the event
    Then the event is rejected or quarantined
    And no job, route, or ActivGuard state changes

  Scenario: Telemetry is tenant-scoped
    Given two tenants have devices with similar serial labels
    When telemetry arrives for one tenant route
    Then only that tenant's rollups are updated
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| ActivGuard regression | Critical | Adapter isolation, contract tests, feature flags |
| Telemetry volume overload | High | Rollups, retention, queue backpressure |
| Location privacy breach | High | Consent, RBAC, retention, coarse views by role |

## Category 3: Dispatch, Routing, Field Logistics, Offline Mobile, Subcontractor Portals

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Scheduling, capacity, calendar, booking conversion, technician execution records, evidence, quick links, locations, and mobile shell tests exist.
- PWA plan explicitly says no service worker is enabled and authenticated routes must remain network-first.
- No full offline sync engine or subcontractor portal exists.

Conflicts:
- Offline caching can conflict with auth, customer data, payment data, public portal tokens, and logout safety.
- Subcontractor access conflicts with current coarse role model if implemented as normal users.

Regression risks:
- Stale offline job updates can corrupt scheduling or inventory.
- Subcontractors could see tenant/customer data outside their assignment.

Resolution:
- Implement offline as a scoped job packet sync, not general page caching.
- Add `FieldSyncPacket`, `OfflineMutationQueue`, and conflict resolution.
- Add subcontractor as a distinct principal type or scoped external user with explicit assignment grants.

### Technical Architecture & Data Flow

Dispatcher assigns job -> mobile downloads scoped packet -> technician works offline -> encrypted local queue stores mutations -> sync endpoint validates version, role, tenant, assignment, and conflict policy -> job execution/evidence/inventory changes are applied idempotently.

### User Stories & Jobs-To-Be-Done

- As a technician, I can continue a downloaded job when signal drops.
- As a dispatcher, I can see whether a field update is pending, synced, or conflicted.
- As a subcontractor, I can access only assigned work packets and upload evidence.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Offline field execution
  Scenario: Offline mutation sync is idempotent
    Given a technician has a downloaded job packet
    When the same offline mutation is submitted twice
    Then the job is updated once
    And the duplicate is recorded as ignored

  Scenario: Subcontractor cannot access unassigned jobs
    Given a subcontractor has one assigned work packet
    When they request another job in the tenant
    Then the API returns forbidden
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale writes overwrite newer work | High | Version vectors and conflict queue |
| Sensitive offline cache | High | Packet minimization, encryption, logout wipe |
| Portal token leakage | High | No public tokens in offline packet |

## Category 4: UI/App Usability, Responsive Grid, Unified App/Portal Design, Measurement Profiles

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Operator shell, mobile/tablet coverage, command palette, Live Work home, customer portal, public booking/status, guided setup, custom fields, and job-sheet templates exist.
- Measurement defaults exist in settings and templates for wheels/vehicle context.

Conflicts:
- Unified design could accidentally expose app navigation in customer portal.
- Measurement profiles could conflict with protected job-sheet template blocks.

Regression risks:
- Responsive grid changes can break high-volume operator pages.
- Shared UI components can leak role-only actions into customer or public routes.

Resolution:
- Create shared design tokens and primitive components, but keep route-specific shells and permission gates.
- Add `MeasurementProfile` as tenant/location/trade scoped configuration, referenced by templates rather than replacing them.

### Technical Architecture & Data Flow

Tenant settings -> profile resolver -> job/template renderer -> field validation -> execution evidence. UI shells remain app, platform, customer, and public specific.

### User Stories & Jobs-To-Be-Done

- As an operator, I can use the same visual language across dashboard, portal, and mobile.
- As an admin, I can define measurement profiles once and reuse them safely.
- As a technician, I see only the measurements relevant to the job type.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Unified responsive UX
  Scenario: Customer portal does not expose operator navigation
    Given a customer is logged in
    When they view the customer workspace
    Then no dashboard-only navigation or platform controls are present

  Scenario: Measurement profile applies to a new job
    Given a tenant has a wheel measurement profile
    When a matching job is created
    Then the job sheet includes the configured measurement fields
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shell permission leak | High | Route-specific shells and E2E checks |
| Template migration breakage | Medium | Profile references, not template replacement |
| Mobile layout regression | Medium | Tablet/mobile screenshot tests |

## Category 5: Customer Portals, Media Galleries, Retention Triggers, SMS/Email Automation

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Customer accounts, workspace, approvals, artifacts, quotes, service plans, job proof, public status, and email delivery readiness exist.
- Notification routing, summary scheduler, email templates, lifecycle links, and privacy-safe visit metrics exist.
- SMS is not verified as implemented.

Conflicts:
- Media galleries can expose non-portal-safe artifacts.
- SMS automation can conflict with consent, notification routing, and sender ownership.

Regression risks:
- Customer data leakage through portal-visible flags.
- Unverified SMS readiness could fake delivery.

Resolution:
- Extend existing customer workspace and artifact model with gallery grouping and retention triggers.
- Add `CommunicationChannelProvider` with SMS readiness and consent checks.
- Keep default email system truthful; SMS is setup-needed until provider verified.

### Technical Architecture & Data Flow

Job/customer artifact -> portal visibility policy -> gallery view -> retention workflow -> notification automation -> delivery attempt -> audit and customer timeline.

### User Stories & Jobs-To-Be-Done

- As a customer, I can view job photos and signed documents in one portal.
- As an owner, I can trigger retention workflows after completed jobs or declined quotes.
- As an admin, I can see whether email/SMS routes are ready without seeing secrets.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Customer portal communications
  Scenario: Non-portal media is hidden
    Given a job has private and portal-visible artifacts
    When the customer opens the media gallery
    Then only portal-visible artifacts are shown

  Scenario: SMS automation is not faked
    Given no verified SMS provider exists
    When an automation attempts to send SMS
    Then the message is marked setup_needed
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Private media exposed | Critical | Portal visibility policy and tests |
| SMS consent breach | High | Consent records and channel gating |
| Automation spam | Medium | Rate limits and idempotency |

## Category 6: Compliance, UK Regulatory Forms, Climate/Weather Checks, GDPR Retention/Export

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Workflow SLA policies, compliance events, compliance exceptions, job execution evidence, audit events, public policy pages, and backup/readiness docs exist.
- No verified UK regulatory form library, weather/climate integration, or full GDPR export/delete workflow exists.

Conflicts:
- Regulatory forms can conflict with custom field and template engines.
- Weather integrations can add location privacy and external dependency risk.
- GDPR deletion can conflict with immutable audit/legal retention.

Regression risks:
- Incorrect compliance claims if forms are static or unverified.
- Excess data retention from weather/location snapshots.

Resolution:
- Add compliance packs as versioned templates with jurisdiction metadata and review status.
- Add weather checks as advisory evidence, not legal certification.
- Add GDPR export/delete workflows with retention policy and legal hold exclusions.

### Technical Architecture & Data Flow

Compliance pack -> job/template requirements -> execution evidence -> exception engine -> export/retention service -> audit log. Weather provider -> normalized advisory snapshot -> job/site evidence with retention.

### User Stories & Jobs-To-Be-Done

- As an owner, I can enable UK compliance packs that add required evidence to relevant jobs.
- As a technician, I can see weather/site checks before starting a risky job.
- As a data subject, I can request export or deletion according to tenant policy and legal retention.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Compliance packs and GDPR workflows
  Scenario: Compliance pack creates missing evidence exception
    Given a UK compliance pack requires a field on completion
    When a job is submitted without that evidence
    Then a compliance exception is opened

  Scenario: GDPR export excludes secrets
    Given an owner exports a customer data subject record
    When the export is generated
    Then tokens, secrets, and internal provider IDs are excluded
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| False regulatory readiness | High | Versioned packs and review status |
| GDPR deletion breaks audit | High | Legal hold/retention classes |
| Weather provider outage | Low | Advisory degraded state |

## Category 7: Intelligent Route and Schedule Optimisation

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Scheduling capacity, calendar, staff availability, blackout dates, location scope, booking slots, and scheduling recommendations exist.
- No full route optimization engine is verified.

Conflicts:
- Optimization could conflict with current booking slot rules, manual assignments, location filters, and availability exceptions.
- External map APIs can expose addresses and technician movement.

Regression risks:
- Poor recommendations causing missed SLA or unsafe travel.
- Expensive route computations degrading dashboards.

Resolution:
- Start with explainable suggestions, not automatic dispatch changes.
- Add `RouteOptimizationRun`, `RouteStop`, and `ScheduleRecommendation` with dry-run preview and manual apply.
- External routing providers are BYOG or platform-approved with redacted logs.

### Technical Architecture & Data Flow

Jobs/bookings/availability/location -> optimization request -> route provider/heuristic -> recommendation set -> dispatcher preview -> explicit apply -> audit and notification.

### User Stories & Jobs-To-Be-Done

- As a dispatcher, I can generate route suggestions and understand why a change is recommended.
- As a manager, I can compare manual route vs optimized estimate.
- As a technician, I receive updated route order only after dispatcher approval.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Route optimization
  Scenario: Optimization is preview-only by default
    Given dispatch has unscheduled jobs
    When route optimization runs
    Then no booking or job assignment changes until a dispatcher applies the plan
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Automatic bad dispatch | High | Preview-only MVP |
| Address leakage | High | Provider policy and redaction |
| Slow optimization | Medium | Async jobs and cached inputs |

## Category 8: Customer Self-Service and Live Tracking

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Public booking, booking status, customer workspace, approvals, service plans, and visit tracking exist.
- No verified live technician tracking exists.

Conflicts:
- Live tracking can conflict with technician privacy, consent, safety, and telemetry boundaries.
- Public status tokens must remain sanitized and bounded.

Regression risks:
- Personal tracking beyond lawful purpose.
- Token leakage in analytics/logs.

Resolution:
- Offer coarse ETA/status first; precise tracking only with tenant policy, technician consent, and time-bounded share links.
- Use telemetry rollups, not raw location trails, for customer-facing views.

### Technical Architecture & Data Flow

Booking/job status -> ETA estimator -> public status page -> optional live share session -> coarse location/ETA events -> expiry and audit.

### User Stories & Jobs-To-Be-Done

- As a customer, I can see booking status and ETA without calling support.
- As a technician, I can pause or limit live tracking according to policy.
- As an owner, I can prove what was shared and when.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Customer live status
  Scenario: Live tracking expires
    Given a customer has a live tracking link
    When the configured expiry passes
    Then the link no longer returns location data
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Worker surveillance concern | High | Consent, coarse data, role policy |
| Public token leak | High | Sanitization and short expiry |
| ETA inaccuracy | Medium | Confidence bands and plain copy |

## Category 9: Inventory, Truck Stock, Low-Stock Triggers

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Stock items, suppliers, purchase orders, stock movements, inventory locations, inventory stock, job parts, reservations, and low-stock surfaces exist.
- Inventory locations already include kinds such as van/truck/warehouse in schema enums.

Conflicts:
- Truck stock must not bypass current reservation/usage accounting.
- Offline part usage can conflict with stock counts.

Regression risks:
- Negative inventory, duplicate movement, or incorrect job margin.

Resolution:
- Extend existing inventory with mobile stocktake and replenishment triggers.
- Use idempotent movement keys and conflict queue for offline usage.

### Technical Architecture & Data Flow

Stock item -> inventory location -> reservation -> technician usage -> stock movement -> low-stock trigger -> purchase order draft.

### User Stories & Jobs-To-Be-Done

- As a technician, I can reserve and use parts from van stock.
- As an inventory manager, I can see low-stock triggers by branch or vehicle.
- As finance, I can see parts cost carried into job profitability.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Truck stock
  Scenario: Offline part usage reconciles once
    Given a technician uses a part offline
    When the device syncs twice
    Then one stock movement is recorded
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Duplicate stock usage | High | Idempotency keys |
| Stock unavailable after offline work | Medium | Conflict resolution |
| Supplier price drift | Medium | PO approval workflow |

## Category 10: CIS Compliance and Subcontractor Verification

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Trade accounts, contacts, approvals, documents, compliance exceptions, roles, and audit exist.
- No CIS-specific verification or subcontractor tax workflow is verified.

Conflicts:
- Subcontractor data is not the same as customer trade accounts.
- CIS verification involves sensitive tax identifiers and retention rules.

Regression risks:
- Misclassified worker/payment status.
- Exposure of UTR/NINO/company verification data.

Resolution:
- Add a subcontractor domain separated from customer/trade accounts.
- Store CIS verification evidence with encrypted fields, retention policy, and finance/admin-only RBAC.

### Technical Architecture & Data Flow

Subcontractor profile -> verification request -> evidence store -> finance approval -> job assignment eligibility -> payment deduction/export.

### User Stories & Jobs-To-Be-Done

- As finance, I can verify a subcontractor before work is assigned.
- As dispatch, I can only assign eligible subcontractors to controlled work.
- As an owner, I can export CIS evidence safely.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: CIS subcontractor verification
  Scenario: Unverified subcontractor cannot be assigned
    Given a subcontractor has no approved verification
    When dispatch assigns them to CIS-controlled work
    Then assignment is blocked with a clear reason
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sensitive identifier exposure | Critical | Encryption, masking, finance/admin RBAC |
| Wrong CIS status | High | Manual verification state and audit |
| Customer/trade account confusion | Medium | Separate subcontractor schema |

## Category 11: Granular RBAC and Immutable Audit Logs

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Roles and permission checks exist but are coarse: owner/admin/dispatcher/finance/technician/viewer and permissions such as `billing.manage`, `portal.manage`, `technician.execute`.
- Audit events and permission denial logging exist.

Conflicts:
- Replacing roles could break existing controller decorators and legacy roles.
- Immutable audit logging can conflict with current clearable safe-error logs if mixed.

Regression risks:
- Access regressions across tenant, location, billing, portal, and platform admin.

Resolution:
- Add a granular policy layer behind existing roles.
- Keep legacy role compatibility and map roles to policy bundles.
- Add append-only audit ledger separate from clearable operational logs.

### Technical Architecture & Data Flow

Role -> policy bundle -> permission evaluator -> location/entity scope -> audit decision -> append-only audit event.

### User Stories & Jobs-To-Be-Done

- As an enterprise admin, I can create roles scoped by branch, function, and entity.
- As an auditor, I can export immutable audit trails.
- As a platform admin, I can verify access decisions without seeing customer secrets.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Granular RBAC
  Scenario: Legacy finance user keeps billing access
    Given a finance user exists before granular RBAC is enabled
    When the new policy engine evaluates billing access
    Then billing manage remains allowed
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Legacy role breakage | Critical | Compatibility mapping |
| Audit tampering | High | Append-only ledger and export hashes |
| Overbroad policies | High | Least-privilege defaults |

## Category 12: Multi-Channel Booking Intake

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Public booking, operator booking, booking status, source enum, booking questions, rate limits, and conversion exist.
- Contact/support forms and integrations exist.

Conflicts:
- Channel intake from email/SMS/webhooks can bypass availability and stale-slot checks.
- Duplicate booking detection can conflict with public rate limits.

Regression risks:
- Spam, duplicate bookings, invalid slot reservations, and PII leakage.

Resolution:
- Add `BookingIntakeLead` as a staging layer before confirmed booking.
- Normalize channels into one intake review/auto-confirm engine with rate limits and idempotency.

### Technical Architecture & Data Flow

External channel -> intake adapter -> lead normalization -> duplicate/rate check -> availability validation -> booking draft/confirmed booking -> notification.

### User Stories & Jobs-To-Be-Done

- As a dispatcher, I can review leads from web, email, phone, and integrations in one queue.
- As a customer, I get clear confirmation only after availability is validated.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Multi-channel intake
  Scenario: Email intake does not bypass availability
    Given an email requests a booking slot that is no longer available
    When the intake lead is processed
    Then no confirmed booking is created
    And the lead requires dispatcher review
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Booking spam | High | Rate limits and review queue |
| Duplicate booking | Medium | Idempotency and matching |
| Availability bypass | High | Shared booking validator |

## Category 13: Asset QR Codes and Lifecycle Tracking

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- `JobAsset` exists but is file/media-like; `DocumentArtifact` and job execution evidence exist.
- No verified durable customer asset lifecycle model or QR code identity layer exists.

Conflicts:
- Naming conflict between `JobAsset` and physical assets.
- QR codes can expose identifiers publicly if raw IDs are embedded.

Regression risks:
- Public scan reveals tenant/customer data.
- Asset lifecycle events may bloat job activity.

Resolution:
- Add separate `CustomerAsset`/`ManagedAsset` model and `AssetQrToken` with hashed token, expiry/revocation, and tenant-scope.
- Keep `JobAsset` for existing job media/files.

### Technical Architecture & Data Flow

Asset record -> QR token -> scan resolver -> permission/public policy -> lifecycle event -> job/service plan linkage.

### User Stories & Jobs-To-Be-Done

- As a technician, I can scan an asset QR and open the correct service history.
- As a customer, I can scan a public-safe asset code and request service.
- As an owner, I can track lifecycle and warranty events.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Asset QR lifecycle
  Scenario: QR token does not expose raw IDs
    Given an asset has a QR code
    When the QR URL is inspected
    Then it contains no raw tenant, customer, or asset ID
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Raw asset ID exposure | High | Opaque token hashes |
| Model confusion | Medium | Separate physical asset model |
| History overload | Medium | Event summarization |

## Category 14: UK Wholesaler/Supplier Integrations and PO Generation

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- Stock suppliers, purchase orders, PO lines, stock movements, and integration credential/orchestration infrastructure exist.
- No verified UK wholesaler catalogue/order API integration exists.

Conflicts:
- Supplier APIs may have tenant-specific credentials and price lists.
- Auto-ordering can conflict with PO approval and stock reservation.

Regression risks:
- Wrong supplier order or price, leaked credentials, duplicate POs.

Resolution:
- Use BYOG supplier connectors with setup-needed readiness until verified.
- MVP is catalogue lookup and PO draft generation, not automatic order placement.

### Technical Architecture & Data Flow

Low-stock trigger -> supplier mapping -> catalogue lookup -> PO draft -> approval -> optional supplier submission -> receipt -> stock movement.

### User Stories & Jobs-To-Be-Done

- As inventory manager, I can generate a PO from low-stock items.
- As an owner, I can connect a wholesaler account without exposing credentials.
- As finance, I can approve before any supplier order is submitted.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Supplier PO generation
  Scenario: Low stock creates a draft PO only
    Given stock is below reorder point
    When replenishment runs
    Then a draft purchase order is created
    And no supplier order is submitted without approval
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Unapproved supplier order | High | Draft-only MVP and approval gate |
| Credential leak | Critical | Encrypted BYOG credentials |
| Price mismatch | Medium | Observed vs expected price display |

## Category 15: Multi-Entity, Branch, Franchise, Parent-Company Support

### Stage 1 Audit Findings & Conflict Resolution Plan

Current state:
- `Company` is tenant root; `Location` supports branch, warehouse, service region, franchise; users can have default location and memberships; location-scoped jobs/bookings/inventory exist.
- No verified parent-company hierarchy across multiple tenant companies exists.

Conflicts:
- Existing tenant isolation assumes one `Company` boundary.
- Parent reporting can accidentally aggregate across tenant boundaries.
- Billing entitlements and subscriptions are tenant-rooted.

Regression risks:
- Cross-tenant data leakage, role scope confusion, billing misassignment.

Resolution:
- Keep `Company` as hard tenant boundary.
- Add `EnterpriseGroup`/`CompanyMembership` for opt-in parent views with explicit grants.
- Use aggregate projections for cross-company reporting, never direct unscoped queries.

### Technical Architecture & Data Flow

Enterprise group -> member companies -> scoped user grants -> aggregate reporting projection -> branch/franchise dashboards -> audit.

### User Stories & Jobs-To-Be-Done

- As a parent-company admin, I can view approved aggregate metrics across branches.
- As a franchise owner, I can keep local customer data private from other branches.
- As platform admin, I can see readiness without impersonating tenant data.

### Critical Acceptance Criteria in Gherkin

```gherkin
Feature: Multi-entity enterprise groups
  Scenario: Parent admin sees aggregate only without explicit detail grant
    Given a parent admin has aggregate access
    When they open a child company dashboard
    Then they see aggregate metrics
    And customer/job detail remains hidden
```

### Risk Assessment & Safe Mitigation Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cross-tenant leak | Critical | Explicit grants and projection tables |
| Billing mismatch | High | Tenant subscription remains per company |
| Franchise role confusion | Medium | Scope-aware policy engine |

## MVP Recommendation

MVP should not start with raw IoT, live tracking, automatic route dispatch, automatic supplier ordering, or broad offline caching. The safest enterprise MVP is:

1. Finance/accounting bridge with tenant-owned payment provider boundary.
2. Offline job packets for technician execution only.
3. Granular RBAC compatibility layer and immutable audit ledger.
4. Asset lifecycle model with QR tokens.
5. Supplier PO draft generation using existing inventory.
6. Multi-entity aggregate reporting over existing `Location` and opt-in group projections.

## Success Metrics

- Zero regression in stable E2E validation.
- No MyTitan Stripe customer-money path.
- No raw provider IDs, secrets, public tokens, or raw IPs in UI/reporting.
- Offline sync conflict rate below defined threshold after beta.
- Route optimization accepted by dispatchers without automatic destructive writes.
- Supplier PO draft-to-approval rate improves procurement cycle time.
- Compliance exceptions become more actionable without increasing false readiness.
