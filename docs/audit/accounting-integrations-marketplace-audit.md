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
| QuickBooks | API connection unless a verified native tenant connection already exists | QBO OAuth scaffolding exists, but the tenant-facing primary route is scoped API tokens, signed webhooks and Finance exports until native readiness is verified. No fake native Connect is shown. |
| Sage | File exchange | BYOG descriptor exists, but no tenant OAuth journey or verified sync implementation exists. Finance exports, API tokens and webhooks are the usable route. |
| FreeAgent | API connection | No native implementation found. Scoped API tokens, signed webhooks and finance exports are available as universal routes. |
| FreshBooks | API connection | No native implementation found. Scoped API tokens, signed webhooks and finance exports are available as universal routes. |
| Zoho Books | API connection | No native implementation found. Scoped API tokens, signed webhooks and finance exports are available as universal routes. |
| KashFlow | File exchange | No native implementation found. Finance exports are the first route with API/webhook options. |
| Microsoft Dynamics 365 Business Central | API connection | No native connector found. Custom API/webhook option is available. |
| NetSuite | API connection | No native connector found. Custom API/webhook option is available. |
| SAP Business One | API connection | No native connector found. Custom API/webhook option is available. |
| Oracle accounting/ERP | API connection | No native connector found. Custom API/webhook option is available. |
| MYOB | API connection | No native connector found. Custom API/webhook option is available. |
| Odoo | API connection | No native connector found. Custom API/webhook option is available. |
| Exact Online | API connection | No native connector found. Custom API/webhook option is available. |
| CSV import/export | Import/export available | Finance exports are surfaced through the Finance workflow. Imports are not claimed from the catalogue. |
| API tokens | Available for permitted users | `/dashboard/settings/developer-tools#api-tokens`, `/integrations/api-tokens`, reveal-once token creation and audit logging exist. |
| Signed webhooks | Available for permitted users | `/dashboard/settings/developer-tools#webhooks`, `/integrations/webhooks`, delivery logs, test and retry controls exist. |
| Custom accounting system | API/webhook compatible | Scoped API tokens plus signed webhooks provide an approved external-system path without raw secrets in the catalogue. |

## Security Boundaries

The catalogue does not expose provider secrets, raw organisation IDs, access tokens, refresh tokens or internal tenant IDs. Normal tenant RBAC remains enforced by linked API routes. Integration requests reuse the audited support request path and explicitly warn users not to submit secrets.
