# Accounting Integrations Marketplace Audit

Date: 2026-07-16
Branch: release/v1.0.0-clean
Baseline candidate: v1.0.1-rc4

## Source Of Truth

`IntegrationConnection` is authoritative for native OAuth provider state. `IntegrationCredential` remains the legacy/BYOG credential path for provider readiness and webhook/client-factory descriptors. API tokens and signed webhooks are implemented through `ApiToken`, `WebhookEndpoint` and `WebhookDelivery`.

## Provider Classification

| Provider | Marketplace state | Evidence |
| --- | --- | --- |
| MyTitan Finance | Built in | `/dashboard/finance` supports invoices, payments, statements, balances, VAT record support and finance reporting. No external accounting connection is required. |
| Xero | Setup required in current production baseline | OAuth routes, callback, encrypted token storage and organisation selection exist. Production env lacks `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` and redirect config, so tenant Connect must not show until setup is active. |
| QuickBooks | Coming soon unless a verified tenant connection already exists | QBO OAuth scaffolding exists, but this release does not present a production-ready QuickBooks tenant connection path when credentials are absent. No fake Connect is shown. |
| Sage | Coming soon | BYOG descriptor exists, but no tenant OAuth journey or verified sync implementation exists. |
| FreeAgent | Coming soon | No implementation found in app/API routes or provider descriptors. |
| FreshBooks | Coming soon | No implementation found in app/API routes or provider descriptors. |
| Zoho Books | Coming soon | No implementation found in app/API routes or provider descriptors. |
| KashFlow | Coming soon | No implementation found in app/API routes or provider descriptors. |
| Microsoft Dynamics 365 Business Central | Coming soon | No native connector found. Custom API/webhook option is available. |
| NetSuite | Coming soon | No native connector found. Custom API/webhook option is available. |
| SAP Business One | Coming soon | No native connector found. Custom API/webhook option is available. |
| Oracle accounting/ERP | Coming soon | No native connector found. Custom API/webhook option is available. |
| MYOB | Coming soon | No native connector found. Custom API/webhook option is available. |
| CSV import/export | Import/export available | Finance exports are surfaced through the Finance workflow. Imports are not claimed from the catalogue. |
| API tokens | Available for permitted users | `/dashboard/settings/developer-tools#api-tokens`, `/integrations/api-tokens`, reveal-once token creation and audit logging exist. |
| Signed webhooks | Available for permitted users | `/dashboard/settings/developer-tools#webhooks`, `/integrations/webhooks`, delivery logs, test and retry controls exist. |
| Custom accounting system | API/webhook compatible | Scoped API tokens plus signed webhooks provide an approved external-system path without raw secrets in the catalogue. |

## Security Boundaries

The catalogue does not expose provider secrets, raw organisation IDs, access tokens, refresh tokens or internal tenant IDs. Normal tenant RBAC remains enforced by linked API routes. Integration requests reuse the audited support request path and explicitly warn users not to submit secrets.
