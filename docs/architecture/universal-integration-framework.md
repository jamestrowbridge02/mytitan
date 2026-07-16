# Universal Integration Framework

MyTitan now presents provider cards through an honest connection hierarchy:

1. Native connector
2. Universal API or OAuth pattern when implemented and safe
3. Scoped API token
4. Signed webhook
5. Scheduled export or file exchange
6. Calendar standard
7. Payment link or provider instructions
8. Manual collection or built-in MyTitan workflow

## Tenant Model

The active tenant connection source of truth remains the existing integration stack:

- `IntegrationConnection` for authoritative native provider state.
- BYOG descriptors for provider category, ownership scope, credential type and safe setup route.
- Developer Tools for scoped API tokens and signed webhooks.
- Finance, payments and bookings for built-in operational workflows.

## Connection Types

Supported now:

- `NATIVE_OAUTH` where a real provider flow exists, such as Xero and Google Calendar.
- `API_TOKEN` through Developer Tools.
- `SIGNED_WEBHOOK` through Developer Tools.
- `SCHEDULED_EXPORT` and `CSV_EXCHANGE` where Finance export records exist.
- `ICS_SUBSCRIPTION` through booking ICS feeds.
- `PAYMENT_LINK` as tenant/provider-hosted payment tracking.
- `MANUAL_COLLECTION` for bank transfer, cash, cheque and terminal evidence.
- `BUILT_IN` for MyTitan Finance and MyTitan sign-in/RBAC.

Gated:

- `GENERIC_OAUTH2`, `REST_API`, `SCHEDULED_IMPORT` and `CALDAV` are not marketed as native/live sync. They require additional security and ingestion proof before server-side execution is enabled.

## User-Facing Statuses

Primary marketplace statuses are actionable: Built in, Native, Connect now, API connection, Webhook connection, File exchange, Calendar standard, Payment link, Manual collection, Setup required, Action required and Connected.

Request native integration remains a secondary detail-drawer action only.
