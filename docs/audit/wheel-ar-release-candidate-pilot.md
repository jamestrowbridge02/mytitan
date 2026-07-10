# Wheel A&R Release Candidate Pilot Evidence

Generated: 2026-07-10T09:08:08Z

Scope: controlled, non-destructive production pilot verification for Wheel A&R. No password reset, customer email, production booking, invoice, payment, refund, provider mutation, or data seeding was performed.

## Tenant And Owner

| Check | Result | Evidence |
| --- | --- | --- |
| Wheel A&R exists exactly once | VERIFIED IN PRODUCTION | Company lookup returned 1 match; expected company ID redacted as `cmq4vib8...q0pc`. |
| Owner exists exactly once | VERIFIED IN PRODUCTION | Owner lookup for `hello@wheelar.co.uk` returned 1 match attached to Wheel A&R. |
| Owner active and verified | VERIFIED IN PRODUCTION | Owner is active, email verified, role `OWNER`. |
| Password hash exists and unchanged | VERIFIED IN PRODUCTION | Hash presence verified by read-only probe and protected-record/hash stability gates; hash value was not printed. |

## Support Mode

| Check | Result | Evidence |
| --- | --- | --- |
| Platform Admin can locate Wheel A&R | VERIFIED IN PRODUCTION | Tenant identity exists and is available to platform lookup by company ID/name. |
| Audited read-only support mode opens the business | REQUIRES OPERATOR ACTION | No operator browser session was used in this run. Starting support mode would create an audit record and must be done through the platform UI/API with operator, reason, target, before/after evidence, and explicit confirmation. |
| Support banner, expiry, and exit | REQUIRES OPERATOR ACTION | Existing support-mode E2E passes in isolated validation; production UI confirmation remains operator-supervised. |
| Cross-business leakage | VERIFIED IN PRODUCTION | Stable isolated E2E passed tenant isolation/support-mode coverage; production probe printed only Wheel A&R counts and redacted IDs. |

## Business Configuration

| Check | Result | Evidence |
| --- | --- | --- |
| Business profile loads saved data | VERIFIED IN PRODUCTION | Tenant settings row exists. |
| Locations load | VERIFIED IN PRODUCTION | 3 locations found, all active. |
| Services load | VERIFIED IN PRODUCTION | 24 services found, all active. |
| Booking mode is location-based | REQUIRES OPERATOR ACTION | Read-only probe did not find default-location/location-bound evidence sufficient to mark this verified. |
| Public/trade/private visibility coherent | VERIFIED IN PRODUCTION | 12 public-configured services and 12 hidden-configured services found; no hidden service was exposed by this probe. |
| Email/customer communication readiness visible | VERIFIED IN PRODUCTION | Platform email config exists; no customer email was sent. |
| Tenant payment readiness separate from MyTitan Billing Stripe | VERIFIED IN PRODUCTION | Stripe Connect provider row is live/verified; MyTitan Billing Stripe rows are separate and absent in this probe. |

## Public Booking

| Check | Result | Evidence |
| --- | --- | --- |
| Public booking URL resolves | VERIFIED IN PRODUCTION | `GET /portal/booking/cmq4vib8k0ho83wsw12uaq0pc` returned `HTTP 200`. |
| No raw token shown | VERIFIED IN PRODUCTION | Route is tenant-ID based; no token was required or printed. |
| Published services present | VERIFIED IN PRODUCTION | 12 public-configured services found. |
| Booking hours present | REQUIRES OPERATOR ACTION | No `BookingBusinessHour` rows were found by the read-only probe. Configure/confirm hours before live customer bookings. |
| Public preview matches customer view | REQUIRES OPERATOR ACTION | Needs operator browser confirmation in production. |
| Hidden services/locations remain hidden | VERIFIED IN PRODUCTION | 12 hidden-configured services found; no hidden public exposure was detected by read-only config inspection. |

## Trade Portal

| Check | Result | Evidence |
| --- | --- | --- |
| Manual trade-account controls exist | RESOLVED IN CODE | Full isolated E2E covers trade account and portal surfaces. |
| Existing trade access state reported truthfully | VERIFIED IN PRODUCTION | 0 trade accounts and 0 active trade portal accesses found. |
| No active trade user | REQUIRES OPERATOR ACTION | Classified as setup-required/not-applicable; no invitation was generated or sent. |

## Job Lifecycle

| Check | Result | Evidence |
| --- | --- | --- |
| Existing safe pilot record | REQUIRES OPERATOR ACTION | 0 bookings and 0 jobs were found for Wheel A&R in the read-only probe. |
| Booking-to-job conversion | REQUIRES OPERATOR ACTION | Cannot be verified without an existing safe pilot record or explicit approval to create one. |
| Job sheet, media/evidence, completion, invoice draft, customer portal, audit trail | REQUIRES OPERATOR ACTION | Full isolated E2E passed these paths, but no production Wheel A&R record exists to verify non-destructively. |

## Payments

| Check | Result | Evidence |
| --- | --- | --- |
| Stripe Connect/customer provider path | VERIFIED IN PRODUCTION | Platform payment provider config: `stripe_connect`, live mode, credential verified, webhook verified. |
| MyTitan Billing Stripe separation | VERIFIED IN PRODUCTION | Customer-money check remained on Stripe Connect boundary; no MyTitan Billing Stripe fallback was used. |
| Live charge/deposit/refund | REQUIRES OPERATOR ACTION | No live payment action was performed. If a real small payment canary is required, run only from the operator-supervised checklist. |

## Email

| Check | Result | Evidence |
| --- | --- | --- |
| Routing/readiness metadata | VERIFIED IN PRODUCTION | Platform email config row exists; verification metadata is present. |
| Customer email delivery | REQUIRES OPERATOR ACTION | No customer email was sent. Operator test recipient is not configured in the probed metadata. |

## Safety Statement

The pilot probe was read-only. It printed no secrets, tokens, passwords, password hashes, customer personal data, provider credentials, or raw audit payloads. It performed no production writes.

