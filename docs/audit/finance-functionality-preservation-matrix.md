# Finance Functionality Preservation Matrix

| Capability | Old location | New location | Permission / source | Test coverage | Result |
| --- | --- | --- | --- | --- | --- |
| Finance summary | Main page | Overview tab | `/billing/finance-report` | Booking finance E2E | Preserved |
| Create invoice | Header action | Header action | `/dashboard/jobs/new` | Navigation/E2E | Preserved |
| Create payment request | Permanent form | Payment requests tab drawer/panel | `/billing/payment-requests` | Existing API and E2E flows | Preserved |
| Payment request queue | Main page | Payment requests tab | Finance report | Typecheck/E2E route | Preserved |
| Statements | Main page | Statements tab | `/billing/statements` | Booking finance E2E/API | Preserved |
| Reconciliation | Main page | Reconciliation tab | Finance report and review endpoint | Payment hardening E2E/API | Preserved |
| Refund | Main page | Invoices tab | `/billing/refund` | Booking finance E2E/API | Preserved |
| Adjustment | Main page | Invoices tab | `/billing/adjustment` | Booking finance E2E/API | Preserved |
| Invoice records | Main page | Invoices tab | Finance report | Booking finance E2E | Preserved |
| Customer balances | Main page | Overview tab | Finance report | Booking finance E2E | Preserved |
| Booking deposits | Main page | Overview tab | Finance report | Typecheck/E2E route | Preserved |
| Export CSV | Header action | Header action | Active finance report data | Existing export tests/API | Preserved |
