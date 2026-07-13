# Communications Test Event Cleanup Runbook

Purpose: identify operational or validation communication records that should not appear in tenant customer inboxes.

## Dry Run

1. Confirm environment and database target through the production-operation framework.
2. Run a read-only query for immutable markers:
   - `metaJson.source = ops_alert_smoke_test`
   - `metaJson.communicationEventClass = PLATFORM_OPERATIONAL_ALERT`
   - `metaJson.communicationEventClass = VALIDATION_E2E_EVENT`
   - `entityType IN (tenant, platform)` with operational reason keys
3. Export:
   - notification id
   - company id
   - type
   - entity type
   - created at
   - meta marker
4. Review with an operator before any mutation.

## Cleanup Constraints

- Do not select by title/body text.
- Do not delete customer conversation, portal conversation, manual log or customer delivery records.
- Do not mutate Stripe products, prices, subscriptions or payment requests.
- Do not clear runtime customer data.
- Prefer marking or archiving through an approved production operation if a mutation is later approved.

## Current Code Status

The tenant inbox no longer returns operational/test/internal event classes, so cleanup is optional hygiene rather than a UI blocker.
