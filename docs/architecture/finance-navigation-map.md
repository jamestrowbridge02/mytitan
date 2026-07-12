# Finance Navigation Map

Date: 2026-07-12

`/dashboard/finance` is the canonical tenant customer-finance entry.

| Finance concept | Canonical location | Compatibility route |
| --- | --- | --- |
| Overview | `/dashboard/finance` | Same |
| Invoices | `/dashboard/finance` | Job/invoice record links retained |
| Payments | `/dashboard/finance` | Previous Payments label retained only as search keyword |
| Payment requests | `/dashboard/finance` | Existing payment request routes retained |
| Revenue | `/dashboard/finance` | `/dashboard/revenue` remains deep-link compatible |
| Reconciliation | `/dashboard/finance` | Finance view |
| Payment setup | Settings payments shortcut from Finance/Settings | `/dashboard/settings/payments` |

MyTitan subscription/account billing remains separate from tenant customer money:

| MyTitan account concept | Location |
| --- | --- |
| Plans | `/dashboard/billing` or account billing subsections |
| Job packs | `/dashboard/billing?section=job-packs` |
| MyTitan invoices | `/dashboard/billing` |
| MyTitan payment method | `/dashboard/billing` |

Customer payment-provider setup must not fall back to MyTitan Billing Stripe.

