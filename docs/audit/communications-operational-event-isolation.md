# Communications Operational Event Isolation

## Root Cause

Operational alert smoke tests were written through the same `Notification` table used by tenant communication history. They carried `entityType=tenant`, `entityId=<companyId>` and `metaJson.source=ops_alert_smoke_test`, but the tenant communications query did not classify or exclude operational/system event classes.

## Fix

- `NotificationsService` now classifies communication rows before returning them from `listCommsByTenant`.
- Tenant Communications can only display:
  - `CUSTOMER_CONVERSATION`
  - `PORTAL_CONVERSATION`
  - `MANUAL_CUSTOMER_LOG`
  - `CUSTOMER_DELIVERY_EVENT`
- Tenant Communications excludes:
  - `PLATFORM_OPERATIONAL_ALERT`
  - `VALIDATION_E2E_EVENT`
  - `INTERNAL_SYSTEM_EVENT`
- New send records are stamped with a customer-visible communication class.
- Operational alerts are stamped with `PLATFORM_OPERATIONAL_ALERT`.
- Production refuses operational alert smoke-test creation.

## Production Handling

Existing production records must not be deleted automatically. Any cleanup must be read-only first and selected by immutable markers such as `metaJson.source=ops_alert_smoke_test` or `metaJson.communicationEventClass=PLATFORM_OPERATIONAL_ALERT`, never by display text.
