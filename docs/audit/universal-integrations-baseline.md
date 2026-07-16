# Universal Integrations Baseline

Baseline recorded from `/opt/mytitan` on `release/v1.0.0-clean`.

## Source State

- Starting commit: `3ce3361911f1209506a394c571b2f068a3259b7f`
- Starting candidate: `v1.0.1-rc5`
- Worktree at start: clean and aligned with `origin/release/v1.0.0-clean`
- Existing rc tags: `v1.0.1-rc1` through `v1.0.1-rc5`

## Existing Foundations

- `IntegrationConnection` remains authoritative for native OAuth accounting state.
- BYOG descriptors already cover Xero, QuickBooks, Sage, tenant-owned payment providers, Google/Microsoft calendar rows, generic API and generic webhook rows.
- Developer Tools already provide reveal-once scoped API tokens and signed outbound webhooks.
- Finance already provides invoices, payment requests, balances, statements and export-oriented finance records.
- Booking settings already expose tenant-scoped public booking and ICS feed URLs without raw token exposure in tenant settings payloads.
- Customer payments already separate MyTitan Billing Stripe from tenant customer funds, with Stripe Connect and manual/bank transfer options.

## Root Cause

Connected Tools still presented many providers as roadmap cards. Several providers had primary states such as Coming soon, Not implemented, Not available, Learn more or Request integration even when a truthful MyTitan route existed through API tokens, signed webhooks, file exchange, ICS feeds, payment links, reconciliation/manual collection, or a built-in MyTitan workflow.

## Safety Boundary

This pass does not add fake native OAuth, does not collect provider passwords, does not run arbitrary transformations, and does not add a generic server-side REST runner. Generic REST/OAuth, scheduled import and CalDAV remain gated until dedicated SSRF, OAuth and ingestion controls are fully proven.
