# Integration Marketplace Readiness - 2026-07-10

This matrix records the tenant-facing Integration Marketplace truth states implemented during the mass-launch pass. It does not assert external provider activation unless evidence exists.

## Implemented Marketplace States

- Connected
- Setup required
- Needs attention
- Built in
- Native
- Connect now
- API connection
- Webhook connection
- File exchange
- Calendar standard
- Payment link
- Manual collection
- Built in alternative

## Provider Matrix

| Area | Provider | Current State | Evidence / Boundary |
| --- | --- | --- | --- |
| Payments | Stripe | Connected / Setup required / Needs attention from runtime readiness | Uses customer-payment readiness. Does not route tenant customer money through MyTitan Billing Stripe. |
| Payments | Bank transfer | Connected / Manual collection | Uses BYOG provider row; no bank details are exposed in UI/test payloads. |
| Payments | Manual card terminal | Connected / Manual collection | Records business-owned manual terminal setup. |
| Payments | SumUp, Zettle, Dojo, Tyl, terminal providers | Manual collection | Terminal/manual payment recording and reconciliation route. |
| Payments | PayPal, Square, GoCardless, Worldpay, Adyen, Checkout.com, Mollie, Braintree, Opayo | Payment link | Provider-hosted links/instructions, signed webhook or reconciliation review. |
| Accounting | Xero | Connected / Setup required / Needs attention | Existing OAuth/readiness surface remains tenant-scoped and token-free. External app registration credentials still required for live activation. |
| Accounting | QuickBooks and API-capable accounting providers | API connection | Scoped API token, signed webhook and export route. No fake native connect. |
| Accounting | Sage and KashFlow | File exchange | Finance export first, API/webhook route available for approved external workflows. |
| Calendar | Google Calendar | Connected / Setup required / Needs attention | Personal integration remains scoped to current user. |
| Calendar | Microsoft 365, Outlook, Exchange, Apple, generic ICS | Calendar standard | ICS feed route. Native provider OAuth is not claimed. |
| Communications | Email sender | Connected / Setup required / Needs attention | Workspace sender setup remains tenant-owned and token-free in UI. |
| Communications | Twilio SMS | Requires external account | Gateway, consent, delivery logs, and cost controls required. |
| Communications | WhatsApp Business | Connected or Requires external account | Connected only when BYOG provider row is connected; otherwise setup-gated. |
| Automation | Provider-neutral directions / Google Maps | Limited / API connection | Safe directions route plus scoped API review path. |
| Storage | OneDrive, Google Drive, Dropbox | API connection | MyTitan documents remain available; external storage uses API/webhook route. |
| Automation | Zapier, Make, n8n | Webhook/API connection | Uses scoped API keys and signed webhooks as foundation; no provider-specific app claim. |
| CRM | HubSpot, Salesforce | API connection | Uses scoped API keys and signed webhooks as foundation. |
| Identity | Google sign-in, Microsoft Entra ID, SAML / Okta | Built in alternative | MyTitan sign-in and RBAC remain the current path; enterprise SSO requires security review. |
| Developer | API tokens | API connection | Scoped API token creation is permission-gated. |
| Developer | Webhooks | Webhook connection | Signed webhook delivery history/test delivery remains tenant-scoped. |

## Tests Updated

- `app/e2e/phase-10i-payments-integrations.spec.ts`
- `app/e2e/integrations-platform.spec.ts`
- `app/e2e/verification-and-bookings-state.spec.ts`
- `app/e2e/phase-10-launch-readiness.spec.ts`

Full isolated proof must be refreshed for the rc6 candidate.
