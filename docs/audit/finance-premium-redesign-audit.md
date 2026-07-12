# Finance Premium Redesign Audit

## Scope

Tenant route: `/dashboard/finance`

The page uses `/billing/finance-report`, `/billing/statements`, `/billing/payment-requests`, refund/adjustment endpoints and invoice action endpoints. The redesign keeps existing calculations and endpoints while separating workflows into tabs.

## Item Mapping

| Previous item | Classification | Source / permission | New placement | Result |
| --- | --- | --- | --- | --- |
| Finance page header with many actions | Page title / secondary navigation | Finance route | Compact header with Create invoice, Payment request, Export, Settings | Preserved/condensed |
| Money owed / overdue / paid / review / VAT stats | Financial snapshot | Finance report | Four-card snapshot plus VAT setup in overview | Preserved/merged |
| Permanent payment request form | Payment workflow | `/billing/payment-requests` | Payment requests tab, opened by action | Moved |
| Global filter block | Filter | Finance report query | Compact filter section | Preserved |
| Finance summary | Overview | Finance report | Overview tab | Preserved |
| Payment requests | Queue | Finance report | Payment requests tab | Preserved |
| Reconciliation queue | Queue | Finance report | Reconciliation tab | Preserved |
| Refunds and adjustments | Sensitive finance actions | Refund/adjustment APIs | Invoices tab | Preserved |
| Account statements | Statement workflow | Statement APIs | Statements tab | Preserved |
| Customer balances | Overview | Finance report | Overview tab | Preserved |
| Booking deposits | Overview | Finance report | Overview tab | Preserved |
| Invoice records | Invoice queue | Finance report | Invoices tab | Preserved |

## Boundaries

No tenant customer money is routed through MyTitan Billing Stripe. Provider selection remains limited to business collection methods exposed by the existing API.
