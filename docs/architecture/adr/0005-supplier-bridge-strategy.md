# ADR 0005: Supplier Bridge Strategy

## Context
Enterprise users need UK wholesaler catalogues, purchase orders, and stock replenishment. Live supplier ordering can affect cost, stock, and external commitments.

## Decision
Use supplier bridge contracts first. Supplier integrations declare catalogue, price, availability, and PO capabilities independently, with dry-run validation before live ordering.

## Consequences
- Inventory and truck stock can be implemented before live supplier mutation.
- Supplier identifiers stay provider-scoped and are masked where needed.
- Purchase orders require explicit tenant configuration and audit events.

## Rejected Alternatives
- Hard-coding a single wholesaler API.
- Creating live purchase orders from low-stock triggers by default.
- Storing supplier credentials in client-visible payloads.

## Rollout Notes
Gate with `truck_stock_v1` and future supplier flags. Initial work should only validate mappings and generate draft PO intent.
