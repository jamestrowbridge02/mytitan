# MyTitan Production Source of Truth

Generated: 2026-06-30

This host is consolidated around one active production worktree and one Docker Compose project. Do not treat temporary release folders, backup archives, generated evidence, or legacy Titan services as active MyTitan runtime paths.

## Active Production System

| Area | Active source of truth | Status |
| --- | --- | --- |
| Project path | `/opt/mytitan` | Active production worktree |
| Git commit | `2787fe098321cbb5402b1d10f3288f722e507756` | Protected release baseline |
| Docker Compose project | `mytitan` | Active |
| API container | `mytitan_api`, local port `127.0.0.1:3000` | Active |
| App container | `mytitan_app`, local port `127.0.0.1:3001` | Active |
| Marketing container | `mytitan_marketing`, local port `127.0.0.1:3002` | Active |
| Database container | `mytitan_postgres` | Active |
| Redis container | `mytitan_redis` | Active |
| Postgres volume | `mytitan_pgdata` mounted at `/var/lib/postgresql/data` | Unsafe to remove |
| Redis volume | Docker volume mounted at `/data` in `mytitan_redis` | Unsafe to remove |
| Backup path | `/opt/mytitan/backups` | Active backup archive |
| Runtime env | `/opt/mytitan/.env` | Active, never commit or print |
| Nginx enabled MyTitan routes | `/etc/nginx/sites-enabled/mytitan`, `/etc/nginx/sites-enabled/mytitan.co.uk` | Active |

## Public Route Mapping

| Public host | Nginx target | Classification |
| --- | --- | --- |
| `https://api.mytitan.co.uk` | `http://127.0.0.1:3000` | Active API |
| `https://app.mytitan.co.uk` | `http://127.0.0.1:3001` | Active app |
| `https://mytitan.co.uk`, `https://www.mytitan.co.uk` | `http://127.0.0.1:3002` | Active marketing |

`nginx -t` passed on 2026-06-30.

## Inventory Classification

| Path or resource | Classification | Action |
| --- | --- | --- |
| `/opt/mytitan` | Active | Keep as the only production worktree |
| `/tmp/mytitan-release-clean` | Duplicate, obsolete for runtime | Do not run production from it; archive/remove only after retention decision |
| `/opt/mytitan-backup-mirror.git` | Backup/mirror | Keep unless mirror retention is formally changed |
| `/root/mytitan-worktree-backups` | Backup | Keep under root-only retention |
| `/root/mytitan-alignment-restore-backups` | Backup | Keep; contains pre-restore safety dump |
| `/tmp/mytitan-validation` | Generated validation logs | Safe cleanup candidate after log retention window |
| `/tmp/mytitan-playwright` | Generated Playwright state | Safe cleanup candidate when no validation is running |
| `/opt/mytitan/backups` | Production backup archive | Unsafe to remove without backup retention rule |
| `/opt/mytitan/mytitan-system-check` | Generated/local check artifact | Review before removal |
| `/tmp/mytitan-release-clean/mytitan-system-check` | Duplicate generated artifact | Safe cleanup candidate with duplicate tree |
| Docker project `mytitan` | Active | Keep |
| Docker network `mytitan_internal` | Active | Keep |
| Docker network `mytitan-release-clean_internal` | Duplicate | Cleanup candidate after duplicate tree retirement |
| Docker network `repo_internal` | Duplicate/unknown | Cleanup candidate after confirming no containers use it |
| Docker volume `mytitan_pgdata` | Active production data | Never remove |
| Docker volume mounted by `mytitan_redis` at `/data` | Active production data | Never remove |
| Docker volume `mytitan-release-clean_pgdata` | Duplicate | Cleanup candidate only after confirming no needed restore data |
| Docker volume `repo_pgdata` | Duplicate/unknown | Cleanup candidate only after owner confirmation |
| Anonymous Docker volumes | Unknown/generated | Inspect before any removal |

No duplicate active MyTitan runtime path is approved. `/opt/mytitan` is the only active production worktree.

## Legacy Services And Routes

`systemctl --failed` reported:

- `openipmi.service`: failed, hardware/host service, not a MyTitan runtime service.
- `titan-engine-live.service`: failed, legacy Titan service; document as obsolete unless there is a separate owner.

`titan-tui.service` could not be queried from the restricted execution context. It should remain disabled/inactive if previously disabled.

Extra enabled nginx legacy routes were found:

- `/etc/nginx/sites-enabled/titan` proxies default HTTP traffic to `127.0.0.1:3000`.
- `/etc/nginx/sites-enabled/titan_dashboard` proxies `srv1178818` to `127.0.0.1:8080` behind basic auth.

These are not part of the MyTitan source of truth. Remove or disable only in a maintenance window after confirming no external dependency uses them.

Root crontab entries for `/opt/titan-prod` are already commented out with disable markers. Do not re-enable them.

## Authoritative Scripts

The authoritative script copies are under `/opt/mytitan`:

| Purpose | Script |
| --- | --- |
| Healthcheck | `scripts/healthcheck.sh` |
| Production readiness | `scripts/production-readiness-check.sh` |
| Stable validation | `scripts/validate-e2e-stable.sh` |
| Bundle budgets | `scripts/check-bundle-budgets.sh` |
| Platform admin runtime verifier | `api/scripts/verify-platform-admin-runtime.js` |
| Principal admin immutability verifier | `api/scripts/verify-principal-admin-immutability.js` |
| Protected-record verifier | `api/scripts/verify-protected-records.js` |
| Release evidence package | `scripts/create-release-evidence-package.sh` |
| SaaS ops report | `scripts/create-saas-ops-report.sh` |

Do not run scripts from `/tmp/mytitan-release-clean` for production.

## Configuration Source Of Truth

| Configuration | Source of truth |
| --- | --- |
| Email Provider | Platform Admin Infrastructure, backed by `PlatformEmailProviderConfig` and email service vault loader |
| MyTitan Billing Stripe | Platform Admin Infrastructure, backed by `PlatformBillingStripeConfigService` |
| Stripe Connect | Platform Admin Infrastructure, backed by `PlatformPaymentProviderConfigService` |
| External Monitoring | Platform Admin Infrastructure, backed by `PlatformExternalMonitorConfig` |
| Backups | `/opt/mytitan/scripts/backup.sh` and `/opt/mytitan/backups` |
| Protected tenants | Protected mutation policy and `api/scripts/verify-protected-records.js` |
| Principal admin | Protected mutation policy and `api/scripts/verify-principal-admin-immutability.js` |
| Company OS | `/platform/company-os` and platform admin service |
| Infrastructure | `/platform/configuration` and `/platform/infrastructure` route surface |

Tenant customer payments must remain separated from MyTitan Billing Stripe. Stripe Connect is for tenant/customer payment routing; MyTitan Billing Stripe is for platform subscription and job-pack billing only.

## Data Safety Status

Verified on 2026-06-30:

- `admin@mytitan.co.uk` exists once, active, verified, and protected.
- Wheel A&R exists as company `cmq4vib8k0ho83wsw12uaq0pc`.
- Wheel A&R owner `hello@wheelar.co.uk` exists as user `cmq4vib8r0hoa3wswva0uebib`.
- Wheel A&R has a tenant subscription row.
- Platform email config row exists.
- Platform external monitor config row exists.
- Platform payment provider config row count is currently zero.
- Protected-record verifier passed and confirmed non-E2E commercial counts did not decrease through guarded seed verification.

## Cleanup Plan

Do not run cleanup automatically. Suggested maintenance-window actions:

1. Keep `/opt/mytitan/backups` until a written retention rule exists. Current size is about 3.5 GB.
2. Keep `/root/mytitan-alignment-restore-backups` and `/root/mytitan-worktree-backups` until the Wheel A&R restore has aged through at least one backup cycle.
3. Retire `/tmp/mytitan-release-clean` after confirming no operator still uses it. Current size is about 331 MB.
4. Remove generated `/tmp/mytitan-validation` and `/tmp/mytitan-playwright` only when no validation is running.
5. Docker build cache is the main reclaimable area. `docker system df` reported about 136 GB reclaimable build cache. Use `docker builder prune` only during a maintenance window.
6. Do not prune Docker volumes automatically. Review duplicate volumes individually before any removal.
7. Consider disabling legacy nginx `titan` and `titan_dashboard` enabled sites after confirming they are not required.
8. Consider disabling or removing `titan-engine-live.service` if confirmed obsolete.

## Validation Snapshot

Safe validation run on 2026-06-30:

- `docker compose -p mytitan ps`: all five MyTitan containers running.
- `scripts/healthcheck.sh`: passed, API returned `200 OK`.
- `npm run auth:verify-principal-admin-immutability`: passed.
- `npm run platform:verify-protected-records`: passed.
- `scripts/production-readiness-check.sh`: passed with operational blockers.
- `scripts/check-bundle-budgets.sh`: passed.

Known operational blockers:

- Stripe Connect platform and webhook credentials need setup.
- External uptime monitor is not configured.
- Backup evidence reports `needs_schedule`; confirm backup cadence after consolidation.

Full stable E2E was not run because it includes seed/cleanup behavior and should only be run against the safe guarded scope when production-data risk is explicitly accepted.
