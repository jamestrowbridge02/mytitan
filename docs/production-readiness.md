# Production readiness

Use `scripts/production-readiness-check.sh` before a controlled release. The script reports truthful runtime, host, backup, and public-access checks without printing secrets, private hosts, or token values.

What it checks:

- API healthcheck result
- summary scheduler status via `scripts/summary-scheduler-status.sh`
- backup evidence and restore-preview freshness via `scripts/backup-readiness-status.sh`
- public app, API, and marketing URL checks via `scripts/external-monitoring-status.sh`
- nginx active/enabled state and app TLS expiry visibility
- `app`, `api`, `marketing`, `postgres`, and `redis` service presence
- Prisma migration status by exit code only
- release validation script presence
- public webhook readiness by declared URL and secret presence only
- required environment-variable presence:
  - `INTEGRATIONS_ENCRYPTION_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_CONNECT_WEBHOOK_SECRET`
  - `BACKUP_ENCRYPTION_KEY`
  - `APP_PUBLIC_URL`
  - `API_PUBLIC_URL`
- disk and memory headroom snapshots

Expected public checks:

- app: `APP_PUBLIC_URL/login` should return `200`, `301`, or `302`
- API: `API_PUBLIC_URL/health` should return `200`
- marketing: derived marketing URL should return `200`, `301`, or `302`

What it does not claim:

- live payment or refund success
- backup success when no artifact or restore-preview evidence exists
- legal, tax, or compliance certification
- third-party uptime monitoring when no external monitor identifier is declared

Recommended release sequence:

1. Run `docker compose build app api marketing`
2. Run `docker compose up -d --force-recreate app api marketing`
3. Run `docker exec -w /app mytitan_api /bin/sh -lc 'npx prisma migrate deploy'`
4. Run `docker exec -w /app mytitan_api /bin/sh -lc 'npm run seed:e2e'` when validating the seeded regression suite
5. Run `bash ./scripts/production-readiness-check.sh`
6. Run `bash ./scripts/validate-e2e-stable.sh`
7. Optionally run `bash ./scripts/cleanup-validation-artifacts.sh --days 7` as a dry run, then rerun with `--apply` during maintenance windows.

If the readiness script reports `needs_setup` or `not_configured`, treat that as an operator action before broader rollout.
If it reports `unknown`, run the same script on the production host session that owns nginx, certbot, timers, and backup artifacts.
