# Phase 1F Inventory and Truck Stock Audit

Date: 2026-05-29

## Existing State

- Product/job line items already exist through `JobLineItem` with tenant scope, price snapshots, and optional `stockItemId`.
- Job-sheet material workflow already exists through `JobPart`, job part reservation/use/release endpoints, activity records, and job line item creation on use.
- Estimate workflow already exists through `Quote` and `QuoteLineItem`, with approved quote conversion into job totals and job line items.
- Inventory schemas already exist as `StockItem`, `InventoryLocation`, `InventoryStock`, `StockMovement`, `StockSupplier`, purchase orders, and job parts.
- Technician assignment already exists on `Job.assignedUserId`; truck stock now adds explicit `TechnicianStockAssignment`.
- Vehicle/truck concept existed as inventory location kind `VAN`; Phase 1F treats van locations as truck stock locations.
- Billing/job completion already keeps tenant customer payments separate from MyTitan Stripe. Inventory changes only write job line item snapshots and do not alter payment routing.
- Reporting surfaces already read inventory pressure in analytics/intelligence; Phase 1F adds `/inventory/dashboard` for stock posture, movements, usage, and job assignment.
- Audit architecture uses tenant-scoped `AuditEvent`; every stock movement path now writes an audit event and stock movement ledger row.

## Conflicts

- Legacy `INVENTORY_V1` routes existed before enterprise flags. Phase 1F adds a mandatory `truck_stock_v1` enterprise gate at API entry points while leaving old env-gated UI compatibility in place.
- Legacy `STAFF` role maps to multiple modern roles. New truck-stock mutating endpoints use modern roles where practical, while older item/location endpoints remain owner/admin for sensitive setup.
- Existing purchase orders are still internal drafts/receipts only. Supplier mapping was added without live ordering or external supplier credentials.

## Migration Risk

- Migration is additive: new enum values, new tables, nullable stock movement transfer columns, indexes, and foreign keys.
- Existing `StockItem`, `InventoryStock`, `JobPart`, `Quote`, billing, payment, and Stripe tables are not rewritten.
- `StockMovementType` gains `TRANSFER` and `RETURN`; old movement rows remain valid.

## Rollback Strategy

- Disable `truck_stock_v1` by tenant or environment to block inventory and truck-stock APIs without removing data.
- Because migrations are additive, rollback can leave new tables dormant while reverting application code.
- If transfer data must be ignored, existing on-hand/reserved quantities remain the source of truth and transfer ledger rows can be filtered by type.

## Tenant Isolation Requirements

- Every new table carries `tenantId` and a foreign key to `Company`.
- Every API lookup filters by tenant/company id before mutation.
- Technician stock operations validate assigned job and assigned van stock where the actor role is `TECHNICIAN`.
- Notifications are tenant scoped and routed to workspace owner/admin/dispatcher users only.
- Customer and platform-admin surfaces do not receive inventory management endpoints.
