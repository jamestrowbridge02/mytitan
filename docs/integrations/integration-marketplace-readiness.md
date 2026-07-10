# Integration Marketplace Readiness - 2026-07-10

This matrix records the tenant-facing Integration Marketplace truth states implemented during the mass-launch pass. It does not assert external provider activation unless evidence exists.

## Implemented Marketplace States

- Connected
- Setup required
- Needs attention
- Requires external account
- Beta
- Not implemented
- Not available

## Provider Matrix

| Area | Provider | Current State | Evidence / Boundary |
| --- | --- | --- | --- |
| Payments | Stripe | Connected / Setup required / Needs attention from runtime readiness | Uses customer-payment readiness. Does not route tenant customer money through MyTitan Billing Stripe. |
| Payments | Bank transfer | Connected / Setup required | Uses BYOG provider row; no bank details are exposed in UI/test payloads. |
| Payments | Manual card terminal | Connected / Setup required | Records business-owned manual terminal setup. |
| Payments | SumUp | Requires external account | Marketplace card is visible but explicitly setup-gated. |
| Payments | Square | Requires external account | Provider credentials and webhook evidence required before readiness. |
| Payments | PayPal | Requires external account | Business account, credentials, webhook signing, and payment canary required. |
| Payments | Zettle | Requires external account | Provider evidence required before activation. |
| Accounting | Xero | Connected / Setup required / Needs attention / Not available | Existing OAuth/readiness surface remains tenant-scoped and token-free. External app registration credentials still required for live activation. |
| Accounting | QuickBooks | Connected / Setup required / Needs attention / Not available | Existing OAuth/readiness surface remains tenant-scoped and token-free. External app registration credentials still required for live activation. |
| Accounting | Sage | Requires external account | Foundation only; OAuth/app registration and tenant mapping evidence required. |
| Calendar | Google Calendar | Connected / Setup required / Needs attention / Not available | Personal integration remains scoped to current user. |
| Calendar | Microsoft 365 Calendar | Requires external account | Entra app registration and tenant consent required. |
| Communications | Email sender | Connected / Setup required / Needs attention | Workspace sender setup remains tenant-owned and token-free in UI. |
| Communications | Twilio SMS | Requires external account | Gateway, consent, delivery logs, and cost controls required. |
| Communications | WhatsApp Business | Connected or Requires external account | Connected only when BYOG provider row is connected; otherwise setup-gated. |
| Maps | Provider-neutral directions | Beta | Safe directions-link foundation only. No traffic-aware claim. |
| Maps | Google Maps | Requires external account | Geocoding, travel time, and live maps require provider key and evidence. |
| Storage | OneDrive | Not implemented | No external storage sync claim. |
| Storage | Google Drive | Not implemented | No external storage sync claim. |
| Storage | Dropbox | Not implemented | No external storage sync claim. |
| Automation | Zapier | Beta / Not available | Uses scoped API keys and signed webhooks as foundation; no provider-specific app claim. |
| Automation | Make | Beta / Not available | Uses scoped API keys and signed webhooks as foundation; no provider-specific app claim. |
| Automation | n8n | Beta / Not available | Uses scoped API keys and signed webhooks as foundation. |
| Identity | Google sign-in | Not implemented | Password login remains authoritative. |
| Identity | Microsoft Entra ID | Not implemented | Enterprise SSO remains a readiness item. |
| Identity | SAML / Okta | Not implemented | Requires enterprise identity design, metadata exchange, and tenant enforcement. |
| Developer | API tokens | Connected / Not available | Scoped API token creation is permission-gated. |
| Developer | Webhooks | Connected / Not available | Signed webhook delivery history/test delivery remains tenant-scoped. |

## Tests Updated

- `app/e2e/phase-10i-payments-integrations.spec.ts`
- `app/e2e/integrations-platform.spec.ts`
- `app/e2e/verification-and-bookings-state.spec.ts`
- `app/e2e/phase-10-launch-readiness.spec.ts`

Full isolated proof: 489 expected, 0 unexpected, 0 skipped, 0 flaky.
