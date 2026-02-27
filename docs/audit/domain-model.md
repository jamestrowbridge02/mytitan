# Domain Model Audit

Source: `/opt/mytitan/api/prisma/schema.prisma`

## Core Tenancy Model
- `Company` is tenant root.
- All key business records are tenant-scoped through `companyId`/`tenantId`.
- `User` belongs to `Company`, includes role + `emailVerified` + `tokenVersion`.

## Core Operational Entities
- Jobs:
  - `Job` with lifecycle fields and finance fields (`status`, `invoice*`, `approvedAt`, `signedAt`, `completedAt`).
  - Related: `JobAsset`, `JobMedia`, `JobSignature`, `JobPdf`, `JobActivity`, `JobReminder`, `JobLineItem`.
- Bookings:
  - `Booking` links to `Job`, `Location`, optional pro `Service`, optional `TradeAccount`.
  - Related availability/scheduling: `Service`, `StaffAvailability`, `BlackoutDate`, `BookingQuestion`, `BookingAnswer`.
- CRM:
  - `TradeAccount`, `TradeAccountNote`, `CRMNote`, `CRMTask`, `CustomerTag`, `CustomerSegment`.
- Inventory:
  - `StockItem`, `StockSupplier`, `StockPurchaseOrder`, `StockPOLine`, `StockMovement`.

## Billing & Subscription
- `Plan`, `TenantSubscription`, `UsageMeter`.
- Tenant-level entitlements/settings in `TenantSetting` (`feature*`, plan interval, booking flags, branding, guided setup progress).

## Auth/Security Supporting Entities
- `InviteToken`
- `PasswordResetToken`
- `EmailVerificationToken`

## Notifications
- `Notification`
- `NotificationPreference`

## Status/Lifecycle Fields
- Enums:
  - `JobStatus`: `DRAFT|OPEN|SCHEDULED|IN_PROGRESS|COMPLETED|INVOICED|CANCELLED`
  - `BookingStatus`: `PENDING|PLANNED|CONFIRMED|IN_PROGRESS|COMPLETED|CANCELLED`
  - `TradeAccountStatus`: `ACTIVE|ON_HOLD|CLOSED`
  - `StockPurchaseOrderStatus`: `DRAFT|ORDERED|RECEIVED|CANCELLED`
  - `StockMovementType`: `IN|OUT|ADJUST`
- String statuses also used in:
  - `CRMTask.status`
  - `Notification` read-state via `isRead`
  - `TenantSubscription.status`

## Important Relations (examples)
- `Company -> Users/Jobs/Bookings/TradeAccounts/...` (tenant root)
- `Job -> Booking[]`, `Booking -> Job?`
- `Job -> JobActivity[]/JobReminder[]/JobSignature[]`
- `TradeAccount -> Job[]/Booking[]/CRMNote[]/CRMTask[]`
- `Location -> Job[]/Booking[]/Service[]/Stock*`

## Seed Logic & Idempotency
Source: `/opt/mytitan/api/scripts/seed-demo.js`

- Idempotent strategy used heavily:
  - `upsert` on entities with stable unique keys
  - `findFirst` + create/update fallback
- Demo user/company setup is repeatable.
- Passwords are **not overwritten by default**; overwritten only in `--interactive-reset` mode.

## Schema Risk Notes
- Migration risk hotspot: `/opt/mytitan/api/prisma/migrations/20260222170000_billing_tiers/migration.sql`
  - Drops legacy tables (`Subscription`, `UsageLimit`) and old plan columns.
  - Adds non-null columns on `Plan`.
- Most recent migrations are additive-heavy with indexes and new tables.

## Prioritized Next Actions
1. Normalize string statuses (`CRMTask.status`, subscription status handling) into enums for safer querying.
2. Add explicit DB constraints/checks for media/signature size limits where feasible.
3. Add ERD artifact (auto-generated) under docs to reduce onboarding time.
