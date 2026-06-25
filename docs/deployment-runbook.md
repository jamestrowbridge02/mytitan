# Deployment runbook

Use this runbook for controlled releases. It supports readiness and governance; it does not assert any certification or legal compliance.

## Release steps

1. Build fresh images:
   - `docker compose build app api marketing`
2. Recreate runtime services:
   - `docker compose up -d --force-recreate app api marketing`
3. Apply database migrations:
   - `docker exec -w /app mytitan_api /bin/sh -lc 'npx prisma migrate deploy'`
4. Seed the regression fixtures when validating the E2E suite:
   - `docker exec -w /app mytitan_api /bin/sh -lc 'npm run seed:e2e'`
5. Check production prerequisites:
   - `bash ./scripts/production-readiness-check.sh`
6. Prove the release with the stable suite:
   - `bash ./scripts/validate-e2e-stable.sh`

## Post-release checks

- verify `bash ./scripts/healthcheck.sh`
- verify `bash ./scripts/summary-scheduler-status.sh`
- verify the Operations readiness page in Settings
- verify owner/admin ops alert routing in the workspace

## Rollback guidance

- do not roll back blindly if migrations have already changed the schema
- inspect container health and recent deployment diffs first
- restore from encrypted backup only after an operator-approved restore drill and an incident decision

## Governance notes

- keep a release log with timestamp, operator name, readiness output, and validation result
- record backup drill dates separately from feature releases
- maintain operator-owned privacy, terms, cookie, retention, and subprocessors documents outside the app
