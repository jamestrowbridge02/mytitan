# Phase 1G Supplier Purchasing Audit

Date: 2026-05-29

## Current State

- Inventory and truck stock are tenant-scoped and gated by `truck_stock_v1`.
- Stock movements are the inventory ledger; job consumption and returns already write movement rows.
- Supplier preparation exists through `StockSupplier` and `SupplierItemMapping`.
- Legacy purchase orders already exist as `StockPurchaseOrder` and `StockPOLine`, with draft/order/receive coverage.
- Billing and Stripe flows are separate from inventory and must remain untouched.

## Conflict Points

- The existing `ORDERED` PO status is retained for compatibility, but the new internal workflow uses `DRAFT`, `SUBMITTED_INTERNAL`, `APPROVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, and `CANCELLED`.
- Receiving must create stock only when receipt is posted. Draft, submit, approve, and cancel must not mutate stock.
- Supplier mappings can be missing. The product should surface this as operational attention, not block all internal purchasing.
- Technicians may request stock for assigned jobs, but purchasing approval remains owner/admin-only.

## Supplier-Ordering Risks

- Live supplier ordering is explicitly out of scope.
- Supplier credentials, private URLs, tokens, and API keys are not stored or returned.
- The provider bridge is dry-run/internal-only and reports `liveOrdering: false`.
- UI copy must label the workflow as `Internal PO only`.

## Rollback Strategy

- Migration is additive: enum values, nullable metadata columns, and indexes.
- Existing purchase orders and stock movement history remain valid.
- Feature access remains behind `truck_stock_v1`; disabling the flag hides/blocks the workflow.
- No external supplier state exists, so rollback does not require cancelling supplier-side orders.

## Tenant Isolation Requirements

- Every PO, PO line, supplier, supplier mapping, stock row, and movement lookup must resolve through `tenantId`.
- Platform admins cannot operate tenant stock or tenant purchasing.
- Customer roles cannot access purchase-order APIs.
- Finance may view purchase costs but cannot approve or mutate purchasing.
