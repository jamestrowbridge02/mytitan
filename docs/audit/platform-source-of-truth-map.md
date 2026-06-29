# Platform source-of-truth map

Generated: 2026-06-29

## Connected chain

`Production Setup Wizard / tenant setup`
-> `Infrastructure / Platform Configuration where the domain is platform-owned`
-> `Vault or DB configuration`
-> `Runtime service`
-> `Verification script or readiness endpoint`
-> `Company OS / Launch Control summary`

Tenant setup and platform infrastructure are intentionally not merged. The wizard owns tenant business setup. Infrastructure owns platform-operated dependencies and platform payment/provider credentials.

## Configuration domains

| Domain | Setup surface | API | Source of truth | Runtime consumer | Verification | Company OS / Launch Control consumer |
| --- | --- | --- | --- | --- | --- | --- |
| Email Provider | Platform Admin -> Infrastructure -> Email | `/admin/platform/email-control/provider`, `/verify`, `/test-email` | encrypted provider config or runtime env source | email service effective sender | `notifications:verify-routing`, provider verify/test actions | Company OS evidence, tenant email readiness reads effective can-send status |
| MyTitan Billing Stripe | Platform Admin -> Infrastructure -> MyTitan Billing Stripe | `/admin/platform/platform-configuration/payment-providers/mytitan-billing-stripe*` | `PlatformBillingStripeConfig` | platform billing runtime only | `billing:verify-subscription-prices`, `billing:sync-job-products`, production readiness | Company OS commercial/release evidence; tenant Launch Control only sees subscription/payment state, not secrets |
| Stripe Connect | Platform Admin -> Infrastructure -> Tenant Customer Payment Providers | `/admin/platform/platform-configuration/payment-providers/stripe-connect*` | `PlatformPaymentProviderConfig` | tenant customer payment readiness and onboarding runtime | Connect verify/reload/preflight, production readiness, deposit/refund canary | Launch Control customer payment readiness, Company OS release/payment canary evidence |
| Bank transfer | Tenant payment provider category | tenant payment settings / finance workflows | tenant business-owned payment instructions and recorded payment state | tenant finance workflows | tenant payment/readiness tests | Launch Control customer payment summary |
| Manual card terminal | Tenant payment provider category | tenant payment settings / finance workflows | tenant business-owned terminal evidence and recorded payment state | tenant finance workflows | tenant payment/readiness tests | Launch Control customer payment summary |
| External monitoring | Platform Admin -> Infrastructure -> Monitoring | `/admin/platform/infrastructure/external-monitor` | `PlatformExternalMonitorConfig` plus external monitor script output | external monitoring snapshot | `external-monitoring-status.sh`, production readiness | Company OS Platform Operations and Autopilot linkage |
| Backups | host/runtime scripts | backup readiness scripts | backup artifacts and restore evidence | backup readiness snapshot | `backup-readiness-status.sh`, restore procedure | Company OS operations and release governance |
| Storage | tenant upload/settings surfaces | upload endpoints and storage config | configured storage/runtime env | upload and media services | health/readiness scripts | Company OS product quality evidence |
| DNS / sender identity | Infrastructure Email DNS fields | `/admin/platform/email-control/provider` | email provider config DNS evidence fields | email service and notification verifier | provider verify/test and DNS evidence review | Company OS evidence library |
| Security headers | nginx/runtime config | nginx configuration | nginx host config | public HTTP responses | nginx test, synthetic checks | readiness/evidence reports |
| Runtime services | Docker compose and healthcheck | service health endpoints | compose runtime | app/api/marketing/postgres/redis | `healthcheck.sh`, production readiness | Company OS Platform Operations |

## Payment boundary

- MyTitan Billing Stripe is platform money only: subscriptions, plans, job packs, and platform invoices.
- Stripe Connect, bank transfer, and manual card terminal are tenant customer payment providers.
- Tenant customer deposits, invoice payments, refunds, and trade payments must never route through MyTitan Billing Stripe.
- Infrastructure verification may read readiness and validate catalog state, but it must not mutate Stripe products/prices.

## Operational links

- Infrastructure -> vault/DB config: platform admin API writes encrypted config rows.
- Vault/DB config -> runtime: config services reload from Prisma and expose safe runtime status without secrets.
- Runtime -> verifiers: scripts and API readiness endpoints use the same config services.
- Verifiers -> Company OS: Company OS summarizes status and now links Platform Operations to Infrastructure for platform-owned setup action.
- Tenant Launch Control remains tenant scoped and does not reveal platform secrets.
