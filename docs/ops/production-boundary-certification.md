# MyTitan Production Boundary Certification

Generated: 2026-07-01

## Certification Verdict

Status: **not certified**

Reason: production and validation still share the default `mytitan` Docker project, database service, Redis service, env files, and public URL defaults. The repository now contains hard gates that refuse E2E/demo fixture mutation unless the runtime and database are explicitly non-production, but a fully isolated validation environment has not yet been provisioned.

## Environment Map

| Environment | Required isolation | Current evidence | Verdict |
| --- | --- | --- | --- |
| Production | Dedicated users, tenants, DB, Redis, media, Stripe, email, scheduler, secrets, backups, monitoring | `docker-compose.yml` project `mytitan`; public defaults point at `*.mytitan.co.uk`; DB name `mytitan` | Present but mixed with validation entrypoints |
| E2E | Dedicated E2E users, company, DB, Redis, URLs, fixtures, media | E2E records use `e2e-*`; E2E platform admin is `e2e.platform.admin@mytitan.co.uk`; new guard requires non-production DB/runtime | Partially isolated at record level; infrastructure isolation missing |
| Validation | Dedicated validation stack and DB | `scripts/validate-e2e-stable.sh` historically recreated `mytitan_api` and ran `seed:e2e` against the active stack | Blocked until dedicated validation env is supplied |
| Demo | Dedicated demo tenant and seed data | `seed-sample.js` now requires non-production runtime/database | Guarded, not separately provisioned |
| Staging/dev/local | Dedicated env vars, DB, Redis, media, secrets | Not fully codified in compose files | Blocker |

## Mutation Map

| Surface | Writes | Boundary status |
| --- | --- | --- |
| `api/scripts/seed-e2e.js` | E2E company, users, jobs, bookings, settings, fixtures | Guarded by `assertAutomationBoundary`; fixture IDs must be `e2e-*`; production principal admin no longer used |
| `api/scripts/seed-sample.js` | Demo company/users/trade packs | Guarded by `assertAutomationBoundary` |
| `scripts/validate-e2e-stable.sh` | Recreates API; runs E2E seed; runs Playwright | Now refuses unless runtime, DB, and URLs are non-production |
| `app/e2e/global-setup.ts` | Can seed via Docker before Playwright | Now refuses unless explicit non-production runtime and local/internal API base |
| `api/scripts/repair-principal-admin-scope.js` | Explicit production repair for principal admin | Audited production operation; not generic validation tooling |
| `api/scripts/reset-principal-admin-password.js` | Principal admin password reset | Explicit admin recovery operation; audited |
| `api/scripts/seed-wheel-ar-pilot.js` | Wheel A&R pilot tenant locations/settings/questions | Production-affecting operational script; requires separate audited production-operation policy |
| `api/scripts/seed-tenant-settings.js` | Creates tenant settings for all companies | Production-affecting maintenance script; requires explicit audited production-operation policy |
| `scripts/production-readiness-check.sh` | Runs `prisma migrate deploy`; verification reads | Migration deploy is production mutation-capable and must remain explicit release operation |
| `scripts/cleanup-*.sh` | Filesystem artifact cleanup | File-only, but must remain outside DB/media paths |
| Scheduler/systemd | Dispatches summary email jobs | Production scheduler not isolated from validation until separate units/env exist |

## Protected Record Certification

Protected classes:

- Principal Admin
- Platform Staff
- Commercial Customers
- Trial Customers
- Pilot Customers
- Recovered Customers
- Live Billing
- Live Stripe
- Email Provider
- Infrastructure Config
- Monitoring
- Vault
- Uploads and Media
- Audit Events
- Backups

Current enforcement:

- `admin@mytitan.co.uk` is production-scoped to `mytitan-staff`.
- E2E platform admin is `e2e.platform.admin@mytitan.co.uk`.
- `auth:verify-user-password-hash-stability` verifies protected hashes and principal-admin non-E2E scope across E2E seed.
- `platform:verify-protected-records` verifies provider rows, protected hashes, non-E2E counts, and E2E fixture stability.
- Fixture seeding is now blocked unless runtime and database are explicitly non-production.

Remaining blocker:

- Some production maintenance scripts can still mutate protected classes intentionally; they need a shared audited production-operation wrapper with before/after evidence and rollback metadata.

## Source Of Truth Map

| Domain | Source of truth | Duplication risk |
| --- | --- | --- |
| Principal admin identity | `mytitan-staff` user `principal-admin-mytitan` | Historical E2E row neutralized; verifier guards future drift |
| E2E identity | `e2e-company` and `e2e-*` users | Guarded, but dedicated DB still required |
| Stripe Connect | `PlatformPaymentProviderConfig` vault row | Env fallback exists in readiness logic; needs explicit deprecation or documented precedence |
| Email provider | Platform provider config and runtime env | Env fallback exists; source precedence must be finalized |
| Booking settings | `TenantSetting.businessConfigJson` and booking tables | Multiple settings surfaces exist; ownership needs continued consolidation |
| Readiness | `scripts/production-readiness-check.sh` plus Platform UI summaries | Duplicate readiness calculations remain a risk |
| Scheduler | systemd summary timers and API scripts | Dedicated production vs validation units not yet separated |

## Architecture Certification

Not certified.

Known gaps:

- Validation stack is not physically isolated.
- Runtime env identity is not mandatory for all services.
- Production-operation scripts do not all share one audited bounded mutation wrapper.
- Source-of-truth duplication remains in readiness, provider config fallback, and some settings surfaces.

## Security Certification

Not certified.

Current strengths:

- Principal admin and E2E fixture separation is enforced.
- Protected user hash drift checks exist.
- Stripe key guard and production readiness checks exist.
- Public booking rate limits and upload limits are checked.

Known gaps:

- No single certification gate currently proves RBAC, tenant isolation, media isolation, signed URLs, webhook safety, scheduler safety, and backup encryption in one pass.
- Stable E2E cannot be safely executed until validation infrastructure is separated.

## Operational Certification

Not certified.

Known gaps:

- External uptime monitor remains not configured.
- Backup cadence was previously reported as `needs_schedule`.
- Restore preview evidence is old.
- Validation shares production-shaped Docker resources unless blocked.

## Duplication Report

High-risk duplication:

- Production readiness logic exists in shell scripts and Platform UI summaries.
- Stripe readiness has env and vault awareness paths.
- Email readiness has runtime/env and provider-config paths.
- Booking/settings ownership spans settings, booking, and dashboard surfaces.
- `api/dist` is present in the worktree and should not be treated as source.

## Technical Debt Report

- Provision dedicated `docker-compose.validation.yml` or equivalent with separate DB, Redis, media root, secrets, URLs, and scheduler disabled or validation-only.
- Replace ad hoc production repair/maintenance scripts with a common production-operation wrapper.
- Add a database-level environment marker and require it before automation writes.
- Add media/storage namespace enforcement for production vs validation.
- Consolidate provider readiness source precedence.
- Add CI gate for forbidden production host/database use in E2E tooling.

## Remaining Launch Blockers

1. Dedicated validation/E2E infrastructure is not provisioned.
2. Production-operation scripts are not uniformly wrapped with bounded/audited/rollback evidence.
3. External uptime monitor is not configured.
4. Backup schedule and recent restore drill evidence are incomplete.
5. Stable suite cannot be honestly certified until it runs against an isolated validation stack.

## Final Certification Score

Current score: **62 / 100**

The platform has important protected-record controls, but it is not production-boundary certified until infrastructure-level environment isolation and shared production-operation controls are complete.
