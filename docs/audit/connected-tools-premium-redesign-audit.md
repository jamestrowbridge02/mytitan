# Connected Tools Premium Redesign Audit

## Scope

Audited `/dashboard/integrations` and the readiness sources used by the integration catalogue.

## Readiness Sources

| Category | Integration | Authoritative source | Display result |
| --- | --- | --- | --- |
| Payments | Stripe | `/billing/customer-payment-readiness` | Connected / Setup required / Action required |
| Payments | Bank transfer, manual terminal | `/integrations/byog` | Connected / Setup required |
| Payments | SumUp, Square, PayPal, Zettle | existing payment setup routes | Requires external account unless a verified live flow exists |
| Accounting | Xero | `/integrations/xero/status` | Connected / Setup required / Not available / Action required |
| Accounting | QuickBooks | `/integrations/qbo/status` | Connected / Setup required / Not available / Action required |
| Accounting | Sage | static route capability | Not available |
| Calendar | Google Calendar | `/integrations/google/status` | Connected / Setup required / Not available / Action required |
| Communications | Email | `/integrations/byog` workspace/email sender rows | Connected / Available / Action required |
| Communications | SMS, WhatsApp | BYOG rows and message settings | Connected / Setup required |
| Developer | API tokens, webhooks | developer settings permissions | Connected / Not available |

## Result

The page now uses a catalogue with search and category filters, concise statuses and one primary action per card. Technical readiness wording was removed from the catalogue surface.
