# Communications Premium Redesign Audit

Baseline route: `/dashboard/communications`

Primary API: `GET /notifications/comms?scope=tenant`

Send API: `POST /notifications/send`

## Findings

- The tenant communications page was reading authenticated workspace notification rows and rendering them as a flat message hub.
- The API already enforced authenticated company scope from the JWT and rejected non-tenant scope.
- Operational alert smoke records were created through `sendOperationalAlertSmokeTest` as workspace notifications with `entityType=tenant`, `entityId=<companyId>` and `metaJson.source=ops_alert_smoke_test`.
- Because `/notifications/comms` previously returned all recent notification rows for the company, operational alert records could appear beside customer conversations.
- The UI showed linked entity identifiers through `entityLabel`, which could surface raw job/customer/company identifiers in normal tenant UI.

## Implemented Controls

- Added explicit server-side communication classification:
  - `CUSTOMER_CONVERSATION`
  - `PORTAL_CONVERSATION`
  - `MANUAL_CUSTOMER_LOG`
  - `CUSTOMER_DELIVERY_EVENT`
  - `PLATFORM_OPERATIONAL_ALERT`
  - `VALIDATION_E2E_EVENT`
  - `INTERNAL_SYSTEM_EVENT`
- Tenant communications now returns only customer-visible communication classes.
- Operational alerts are stamped as `PLATFORM_OPERATIONAL_ALERT`.
- Operational alert smoke tests are refused when `NODE_ENV=production`.
- Communications UI no longer displays raw linked-record IDs in conversation labels.
- Channel readiness moved below the conversation workspace.

## Preserved Functionality

- Existing `/notifications/comms` route.
- Existing `/notifications/send` route.
- Email readiness check.
- Settings and template navigation.
- Linked-record navigation.
- Portal reply/send panel for job and booking records.
- Delivery status, sent time, opened time, recipient and audit-safe context.
