# Platform rationalisation inventory

Generated: 2026-06-29

Scope: read-only inventory of Platform Admin setup surfaces, tenant setup surfaces, runtime consumers, vault models, scripts, and tests before consolidation work. Secrets were not read or printed.

## Platform Admin surfaces

| Area | Exists | Route / file | API endpoint | DB / vault model | Runtime consumer | Verification | Tests | Source of truth | Duplicate / overlap | Missing action / risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform Admin overview | yes | `app/pages/platform/index.tsx` | `/admin/platform/overview` | commercial, tenancy, audit, safe error tables | platform admin service | release evidence scripts | `trial-and-platform-admin.spec.ts` | persisted platform records | overlaps Company OS as summary only | no platform setup mutation path |
| Infrastructure | yes | `app/pages/platform/configuration.tsx`; `/platform/infrastructure` re-exports it | `/admin/platform/platform-configuration/payment-providers`, `/admin/platform/email-control`, `/admin/platform/infrastructure/external-monitor` | `PlatformPaymentProviderConfig`, `PlatformBillingStripeConfig`, email provider config, `PlatformExternalMonitorConfig` | payment provider services, email service, external-monitor snapshot | `production-readiness-check.sh`, billing and notification verifier scripts | `platform-admin-recovery.spec.ts` | authoritative platform-owned setup page | `/platform/infrastructure` is a backward-compatible alias to `/platform/configuration` | real credentials can remain missing; page must report not configured truthfully |
| Platform Configuration | yes | `app/pages/platform/configuration.tsx` | same as Infrastructure | same as Infrastructure | same as Infrastructure | same as Infrastructure | `platform-admin-recovery.spec.ts` | same authoritative implementation | route label may appear as Infrastructure in operator language | no separate duplicate implementation found |
| Company OS | yes | `app/pages/platform/company-os.tsx` | `/admin/platform/company-os`, `/admin/platform/company-os/incidents` | platform incidents, commercial records, monitoring snapshots | `PlatformAdminService.getCompanyOperatingSystem()` | `create-saas-ops-report.sh` | `company-os.spec.ts` | evidence-led operating dashboard | summarizes Autopilot and release evidence; does not own configuration | Platform Operations now links back to Infrastructure |
| Autopilot | yes | `app/pages/platform/autopilot.tsx` | `/admin/platform/autopilot/*` | `PlatformAutopilotEvent`, safe error logs | platform autopilot service | health/readiness scripts | stable e2e coverage | sentinel and incident store | Company OS summarizes Autopilot state | no config ownership |
| Commercial | yes | `app/pages/platform/commercial.tsx` | platform billing/commercial endpoints | tenants, trials, subscriptions, billing records | billing service | billing verifier scripts | stable e2e coverage | commercial persisted data | Company OS shows actuals only | must not delete commercial data |
| Email Provider | yes | Infrastructure card | `/admin/platform/email-control/provider`, `/verify`, `/test-email` | encrypted provider config | email service | `notifications:verify-routing` | `platform-admin-recovery.spec.ts`, `trial-and-platform-admin.spec.ts` | Infrastructure/vault or runtime env | tenant workspace email readiness consumes effective state | no dead-end support wording in Platform Admin setup |
| MyTitan Billing Stripe | yes | Infrastructure card | `/admin/platform/platform-configuration/payment-providers/mytitan-billing-stripe*` | `PlatformBillingStripeConfig` | platform billing Stripe config service and billing runtime | `billing:verify-subscription-prices`, `billing:sync-job-products` | `platform-admin-recovery.spec.ts` | separate platform billing vault | distinct from Stripe Connect | readiness must not be used for tenant checkout |
| Tenant Customer Payment Providers | yes | Infrastructure card | `/admin/platform/platform-configuration/payment-providers/stripe-connect*` | `PlatformPaymentProviderConfig` | Stripe Connect runtime config service and customer payment readiness | `stripe-deposit-refund-canary.sh`, production readiness | `platform-admin-recovery.spec.ts`, payments hardening tests | separate tenant customer payment vault | distinct from MyTitan Billing Stripe | real live canary still requires real credentials |
| External monitoring | yes | Infrastructure card and Company OS operations | `/admin/platform/infrastructure/external-monitor` | `PlatformExternalMonitorConfig` | external monitoring snapshot | `external-monitoring-status.sh`, `production-readiness-check.sh` | `platform-admin-recovery.spec.ts`, enterprise monitor tests | Infrastructure config plus runtime script | tenant Operations hides provider config | external provider evidence required before healthy claim |

## Tenant / workspace setup surfaces

| Area | Exists | Route / file | API endpoint | DB / model | Runtime consumer | Verification | Tests | Source of truth | Duplicate / overlap | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Production Setup Wizard / guided setup | yes | `app/pages/dashboard/setup-wizard.tsx` | `/guided-setup/status`, `/step`, `/complete`, `/reset` | tenant company, services, calendar, settings | tenant runtime | stable e2e setup wizard | `setup-wizard.spec.ts` | tenant workspace records | not a platform infrastructure owner | tenant payments step links tenant payment setup only |
| Launch Control | yes | `app/pages/dashboard/settings/launch-control.tsx` | tenant operations, billing, customer payment, notification readiness endpoints | tenant settings and runtime snapshots | tenant go-live dashboard | health/readiness and canary scripts | launch/settings e2e coverage | tenant readiness endpoints | Platform Admin Company OS summarizes release state separately | platform-only configuration remains inaccessible to tenant users |
| Company OS tenant access | guarded | `app/pages/platform/company-os.tsx` | `/admin/platform/company-os` | platform-only evidence | platform admin service | n/a | `company-os.spec.ts` | platform admin RBAC | no tenant duplicate | tenant users receive 401/403 |

## Runtime and scripts

| Domain | Runtime service / script | Source of truth | Connected status |
| --- | --- | --- | --- |
| Docker runtime | `docker compose -p mytitan` app/api/marketing/postgres/redis | compose services and health endpoints | connected to healthcheck and Company OS internal monitoring |
| PostgreSQL | Prisma schema and migrations | database | verified by migration deploy and healthcheck |
| Redis | runtime container | Redis service | visible in internal monitoring and healthcheck |
| Billing catalog | `billing:verify-subscription-prices`, `billing:sync-job-products` | MyTitan Billing Stripe config and catalog env | validation only; Infrastructure does not mutate Stripe products/prices |
| Tenant customer payments | customer payment readiness and Stripe Connect canary | tenant/customer payment provider config | separated from MyTitan Billing Stripe |
| Notifications | `notifications:verify-routing` | email provider config or runtime env | connected to Infrastructure email controls |
| Evidence package | `create-release-evidence-package.sh` | release scripts and generated evidence | does not own setup config |

## Findings

- `/platform/infrastructure` and `/platform/configuration` do not contain two independent implementations; Infrastructure is the operator-facing alias to the same authoritative page.
- Platform setup cards have configure, verify, test, reload, or log/history actions rather than dead-end support messages.
- Company OS is a governance/evidence dashboard, not a configuration owner. Platform Operations now links directly to Infrastructure as the configuration source.
- Tenant guided setup and Launch Control remain tenant-owned setup/readiness surfaces. They must not receive platform credentials or platform-only setup controls.
- No secret values were printed during this inventory.
