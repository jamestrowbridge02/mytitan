# MyTitan Production Boundary Certification

Generated: 2026-07-01

## Certification Verdict

Status: **boundary certified with operational conditions**

Reason: production fixture mutation is now blocked by runtime, URL, database-name, and database-environment-marker guards. The stable E2E suite runs against a separate validation Docker project with separate Postgres, Redis, media storage, URLs, runtime secrets, and scheduler-disabled defaults. Production protected records were verified after the isolated validation run.

This is not a 100/100 launch certificate because external uptime monitoring, backup cadence evidence, and some source-of-truth consolidation work remain open.

## Environment Map

| Environment | Required isolation | Current evidence | Verdict |
| --- | --- | --- | --- |
| Production | Dedicated users, tenants, DB, Redis, media, Stripe, email, scheduler, secrets, backups, monitoring | `docker-compose.yml` project `mytitan`; public defaults point at `*.mytitan.co.uk`; DB marker is `production`; health and readiness passed on 2026-07-01 | Boundary certified; uptime monitor and backup cadence still need operational closure |
| Validation | Dedicated users, tenants, DB, Redis, URLs, media, secrets, audit evidence, scheduler-disabled default | `docker-compose.validation.yml`; project `mytitan-validation`; Postgres volume `validation_postgres_data`; Redis volume `validation_redis_data`; API/app/marketing on `127.0.0.1:3100/3101/3102`; media volume `validation_media`; `MYTITAN_RUNTIME_ENV=validation`; scheduler disabled by default | Certified for isolated E2E validation |
| E2E | Dedicated fixture users/company and non-production database marker | `e2e.platform.admin@mytitan.co.uk`; `e2e-company`; `seed:e2e` requires automation boundary and DB marker in `e2e`, `validation`, `test`, `dev`, or `local` | Certified for validation/E2E contexts only |
| Demo | Dedicated demo data and no production DB mutation | `seed-sample.js` requires automation boundary | Guarded; separate demo infrastructure remains future hardening |
| Dev/local/test | Dedicated local env, DB, Redis, URLs, media, secrets | Runtime guard permits only explicitly non-production runtime and DB names | Guarded by automation boundary |

## Isolated Validation Evidence

The isolated runner is `scripts/validate-isolated-e2e.sh`.

Evidence from 2026-07-01:

- Starts only `docker-compose.validation.yml` with project `mytitan-validation`.
- Resets only validation volumes via the validation compose project.
- Runs `prisma migrate deploy` inside `mytitan_validation_api`.
- Marks the validation database with `environment=validation`, `source=validate-isolated-e2e`, and guard version `production-boundary-v1`.
- Seeds E2E fixtures only after the validation marker is present.
- Runs Playwright against `http://127.0.0.1:3101` and `http://127.0.0.1:3100`.
- Uses `MYTITAN_E2E_API_CONTAINER=mytitan_validation_api`, so validation tests never execute helper commands inside `mytitan_api`.
- Stops the validation stack unless `KEEP_VALIDATION_STACK=1`.
- Result: **478 passed, 0 failed, 0 skipped**.

## Database Environment Marker

Source files:

- `api/prisma/schema.prisma`: `DatabaseEnvironmentMarker`
- `api/prisma/migrations/20260701112000_database_environment_marker/migration.sql`
- `api/scripts/database-environment-marker.js`
- `api/scripts/runtime-guard.js`

Rules:

- Migration-created databases default to `environment=production`.
- Automation writes require an allowed runtime plus an allowed DB marker.
- Production DBs refuse E2E/demo fixture mutation.
- Validation DBs allow fixture mutation only after the validation marker is explicitly set.
- Changing a marker to production requires `MYTITAN_CONFIRM_PRODUCTION_MARKER=1`.

Production evidence from 2026-07-01:

- `npm run seed:e2e` inside `mytitan_api` was refused by the boundary guard.
- `auth:verify-user-password-hash-stability` reported `seedE2eBlockedByBoundary: true`.
- `platform:verify-protected-records` reported `seedE2eBlockedByBoundary: true`.

## Mutation Map

| Surface | Writes | Boundary status |
| --- | --- | --- |
| `api/scripts/seed-e2e.js` | E2E company, users, jobs, bookings, settings, fixtures | Requires automation boundary and DB environment marker; production refused |
| `api/scripts/seed-sample.js` | Demo company/users/trade packs | Requires automation boundary |
| `scripts/validate-isolated-e2e.sh` | Validation stack only | Uses validation project, validation DB/Redis/media, validation URLs, validation API container |
| `scripts/validate-e2e-stable.sh` | Legacy stable runner | Retains production boundary refusal; should be replaced by isolated runner for release proof |
| `app/e2e/global-setup.ts` | Seeds via Docker before Playwright | Runs only with local/internal validation URLs and E2E fixtures enabled |
| `api/scripts/reset-principal-admin-password.js` | Principal admin password reset | Wrapped by production-operation guard; dry-run supported; production confirmation, operator, target, and reason required |
| `api/scripts/repair-principal-admin-scope.js` | Explicit production repair for principal admin | Audited production operation from previous repair phase |
| `api/scripts/seed-wheel-ar-pilot.js` | Wheel A&R pilot tenant locations/settings/questions | Production-affecting maintenance path; must remain outside validation and should be moved under the shared production-operation wrapper before future use |
| `api/scripts/seed-tenant-settings.js` | Creates tenant settings for all companies | Production-affecting maintenance path; should be moved under the shared production-operation wrapper before future use |
| `scripts/production-readiness-check.sh` | Runs `prisma migrate deploy`; verification reads | Release operation only; passed on 2026-07-01 |
| Scheduler/systemd | Dispatches summary email jobs | Production scheduler ready; validation scheduler disabled by default |

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
- `auth:verify-user-password-hash-stability` verifies protected hashes and principal-admin non-E2E scope while proving E2E seed is blocked in production.
- `platform:verify-protected-records` verifies provider rows, protected hashes, non-E2E counts, and E2E fixture stability.
- Validation fixture seeding is physically isolated from production infrastructure.
- Wheel A&R counts and protected user fingerprint remained stable during production verification.

Evidence from 2026-07-01:

- Production hash stability verifier: **passed**.
- Protected records verifier: **passed**.
- Boundary guard script: **passed**.
- Provider vault row count stayed at 3 before/after verification.
- Non-E2E users, companies, trials, bookings, and jobs stayed unchanged during protected-record verification.

## Production Operation Framework

Source file:

- `api/scripts/production-operation.js`

Implemented user:

- `api/scripts/reset-principal-admin-password.js`

Requirements enforced:

- Production or unset runtime refuses mutation unless `MYTITAN_CONFIRM_PRODUCTION_OPERATION=1`.
- Operator, target, and reason are required in production.
- Dry-run mode returns before/after evidence without mutation.
- Operation evidence includes operation, operator, target, reason, dry-run state, runtime environment, timestamp, and evidence ID.

Remaining framework work:

- Move tenant recovery, provider config rotation, backup restore preview, protected tenant recovery, scheduler repair, infrastructure repair, Wheel A&R pilot recovery, and tenant settings maintenance onto the same wrapper before future production use.
- Add per-operation rollback references where mutation is not trivially reversible.

## Source Of Truth Map

| Domain | Source of truth | Status |
| --- | --- | --- |
| Principal admin identity | `mytitan-staff` user `principal-admin-mytitan` | Certified; E2E no longer uses `admin@mytitan.co.uk` |
| E2E identity | `e2e-company` and `e2e-*` users | Certified for validation/E2E only |
| Validation infrastructure | `docker-compose.validation.yml` and `.env.validation.example` | Certified as isolated validation owner |
| Stable release validation | `scripts/validate-isolated-e2e.sh` | Certified; legacy stable runner remains guarded but is no longer the production-boundary proof |
| Stripe Connect | `PlatformPaymentProviderConfig` vault row | Ready; readiness still supports env/vault awareness, documented precedence remains a cleanup item |
| Email provider | Platform provider config and runtime env | Ready; fallback precedence remains a cleanup item |
| Booking settings | `TenantSetting.businessConfigJson` and booking tables | Functional; ownership consolidation remains technical debt |
| Readiness | `scripts/production-readiness-check.sh` plus Platform UI summaries | Still duplicated; shell script is release gate owner until UI calculations are consolidated |
| Scheduler | Production systemd timers; validation scheduler disabled by compose | Certified boundary separation; source ownership documented |
| Generated API output | `api/dist` | Not a source of truth; generated visibility remains a repository hygiene item |

## Security Certification

Certified for production-boundary safety:

- RBAC and tenant/platform separation are covered by the stable suite running against validation.
- Production seed and fixture mutation are refused.
- E2E platform admin is separate from production principal admin.
- Protected records and provider config rows survive validation and production boundary checks.
- Validation URLs, DB, Redis, media storage, secrets, and scheduler settings are separate from production.

Not fully closed for a 100/100 security score:

- One consolidated security certification gate for RBAC, tenant isolation, media isolation, signed URLs, webhook safety, scheduler safety, and backup encryption still needs to be formalized.
- Remaining production maintenance scripts need the shared production-operation wrapper before future use.

## Operational Certification

Passed on 2026-07-01:

- Production build for app, API, and marketing.
- Production healthcheck.
- Production readiness script.
- Protected hash verifier.
- Protected records verifier.
- Isolated validation E2E suite.

Remaining operational gaps:

- External uptime monitor is still `not_configured`.
- Backup cadence evidence still reports `needs_schedule`.
- Restore preview evidence exists but is older than ideal for launch certification.

## Duplication Report

High-risk duplication now bounded or documented:

- Production readiness logic exists in shell scripts and Platform UI summaries; release gate owner is the shell script until consolidation.
- Stripe readiness has env and vault awareness paths; vault is the source for live provider state.
- Email readiness has runtime/env and provider-config paths; provider config is the source for platform provider state.
- Booking/settings ownership spans settings, booking, and dashboard surfaces; technical debt remains.
- `api/dist` is generated output and must not be treated as source.

## Technical Debt Report

- Move all remaining production-affecting maintenance and repair scripts onto `api/scripts/production-operation.js`.
- Consolidate readiness calculations into a single shared source consumed by both shell release checks and Platform UI.
- Finalize provider fallback precedence so Stripe/email readiness has one documented owner per environment.
- Add CI enforcement for `scripts/validate-isolated-e2e.sh` as the only release E2E proof.
- Add a fresh restore drill and declared external monitor evidence before 100/100 launch certification.
- Keep `.env.validation.example` placeholder-only and never commit `.env.validation`.

## Remaining Launch Blockers

1. External uptime monitor is not configured.
2. Backup schedule evidence still needs daily-cadence proof.
3. Restore preview evidence should be refreshed.
4. Remaining production maintenance scripts need shared production-operation wrapper adoption.
5. Readiness/provider/settings source-of-truth duplication needs consolidation or permanent owner documentation.

## Final Certification Score

Current score: **88 / 100**

Boundary certification is complete for isolated E2E validation and production fixture-mutation prevention. The remaining 12 points are operational and source-of-truth hardening items, not evidence that validation can mutate production data.
