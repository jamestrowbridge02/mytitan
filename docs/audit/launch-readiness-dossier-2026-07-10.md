# Launch Readiness Dossier - 2026-07-10

This dossier is evidence collected during the final hardening pass on 2026-07-10. It is not a formal certification claim.

## Executive Result

- Launch readiness: PARTIALLY READY.
- Code-controlled critical blockers found in this pass: none remaining after repair.
- Full isolated E2E validation: READY, 489 passed, 0 failed, 0 skipped, 0 flaky.
- External operational prerequisites remain: external uptime monitor declaration, legal/compliance evidence, and provider-side operational evidence that cannot be created from source control alone.

## Source-Control Changes

- `api/src/main.ts`: production API security headers now default on when `NODE_ENV=production`; explicit `MYTITAN_SECURITY_HEADERS=off` remains available for controlled compatibility testing.
- `api/package.json`, `api/package-lock.json`: upgraded `@nestjs/swagger` to `11.4.5`, removing the audited `js-yaml` advisory path.
- `api/scripts/test-calendar-scheduling.ts`: updated the scheduling smoke harness to match current service constructors and current booking/settings read paths.
- Existing uncommitted app changes were present before this pass and were preserved: navigation language, error-state detail, booking/settings language, calendar operations copy, company profile hub, setup checklist, and `app/e2e/final-product-experience-polish.spec.ts`.

## Validation Evidence

- API typecheck: PASS, `npm run typecheck` in `api`.
- App typecheck: PASS, `npm run typecheck` in `app`.
- Marketing typecheck: PASS, `npm run typecheck` in `marketing`.
- API build: PASS, `npm run build` in `api`.
- App build: PASS, `npm run build` in `app`; 92 pages generated.
- Marketing build: PASS, `npm run build` in `marketing`; 15 pages generated.
- API dependency audit: PASS after repair, `npm audit --audit-level=high`, 0 vulnerabilities.
- App dependency audit: PASS, 0 vulnerabilities.
- Marketing dependency audit: PASS, 0 vulnerabilities.
- Scheduling smoke: PASS, `npx ts-node --transpile-only scripts/test-calendar-scheduling.ts`; overlap conflict guard fired as expected.
- Boundary guards: PASS, `bash scripts/test-production-boundary-guards.sh`; production fixture mutation refused and protected records verified.
- Bundle budgets: PASS, `evidence/bundle/latest.json`; app 5688 KB / 7000 KB, marketing 804 KB / 1200 KB.
- Healthcheck: PASS, `bash scripts/healthcheck.sh`; API returned 200 OK.
- Production readiness snapshot: PASS with exception, `bash scripts/production-readiness-check.sh`; external uptime monitor is `not_configured`.
- Backup readiness: PASS, encrypted backup and restore preview present; latest backup `2026-07-09T03:00:09Z`.
- External monitoring status: PARTIALLY READY; public URL, nginx, and TLS checks pass; external monitor not declared.
- Isolated E2E: PASS, `bash scripts/validate-isolated-e2e.sh`; validation DB marked, 94 migrations applied, fixtures seeded, 489 passed, 0 failed, 0 skipped, 0 flaky. JSON evidence: `/tmp/pw-results-validation/isolated-final-proof.json`.

## Security Evidence

- Helmet security headers are now production-default in code.
- Hardcoded Stripe key guard reported ready in production readiness output.
- Upload policy rejects dangerous extensions including SVG, HTML, script, shell, and executable types; size limits are enforced by file category.
- Stripe webhook E2E coverage passed for invalid signatures, duplicate retries, unknown prices, verified deposits, and no fallback to MyTitan Stripe for tenant-owned customer money.
- Platform admin recovery and support mode E2E coverage passed for token redaction, tenant/platform separation, read-only default, explicit write mode, audit history, and reason-gated owner recovery.
- Boundary guard script passed: protected production fixture mutation refused.

## Architecture Evidence

- Full E2E route/action coverage passed for billing setup destinations, one authoritative Stripe/payment setup surface, calendar operations view, booking visibility, service plans, public booking, customer portal, trade portal, and setup deep links.
- Scheduling smoke verifies tenant scoping for calendar bookings and schedules, advisory lock use for booking overlap prevention, and idempotent job bulk state handling.
- Isolated validation applied all 94 Prisma migrations successfully to a fresh validation database.

## Operational Evidence

- API, app, marketing, Postgres, Redis, scheduler, migrations, Stripe Connect readiness, backup evidence, TLS visibility, nginx state, and public endpoint reachability all reported ready in `production-readiness-check.sh`.
- External uptime monitoring remains not configured and is therefore not counted as ready.
- Principal-admin hash stability standalone script refused fixture seeding because `MYTITAN_RUNTIME_ENV` was not an allowed non-production value; this is production-safeguard evidence, not a completed hash-stability run in this environment.

## Compliance Readiness Mapping

- OWASP ASVS / Top 10 / API Top 10: PARTIALLY READY. Evidence exists for auth/RBAC, tenant isolation, upload validation, webhook validation, replay/idempotency, dependency audit, and headers. Formal ASVS control-by-control signoff remains manual evidence required.
- Cyber Essentials / Cyber Essentials Plus: MANUAL EVIDENCE REQUIRED. Host, device, patch, malware, and access-control attestations require operator evidence.
- ISO 27001 / SOC2: MANUAL EVIDENCE REQUIRED. Policies, risk treatment, vendor management, incident process, access reviews, and audit records require governance evidence.
- GDPR / UK GDPR: PARTIALLY READY. Public privacy, terms, cookies, data retention routes exist; legal review and DPIA/ROPA evidence remain manual.
- PCI DSS: PARTIALLY READY / EXTERNAL PROVIDER REQUIRED. Stripe separation and webhook/payment tests passed; formal PCI scope and provider attestations remain external.
- WCAG AA: PARTIALLY READY. E2E includes responsive/mobile/keyboard/accessibility-oriented checks; formal WCAG audit remains manual evidence required.

## Remaining Risks And Deductions

- External uptime monitor not configured.
  - Evidence: `EXTERNAL_MONITOR_STATUS:not_configured`.
  - Risk: missed independent outage detection.
  - Action: configure a non-secret monitor provider/name/URLs and alert recipient in host environment.
  - Priority: High. Owner: SRE. Effort: 0.5 day.
- Formal compliance certification not complete.
  - Evidence: no formal audit artifacts produced in this pass.
  - Risk: unsupported enterprise compliance claims.
  - Action: gather legal, policy, access-review, vendor, and auditor evidence.
  - Priority: High. Owner: Compliance/Legal. Effort: 3-10 days.
- Provider-side evidence cannot be source-controlled.
  - Evidence: production readiness only verifies presence/readiness signals for Stripe/TLS/email paths; SMS provider evidence was not produced.
  - Risk: third-party operational readiness could differ from code readiness.
  - Action: collect Stripe dashboard, email deliverability, SMS provider, DNS, and monitor screenshots/exports.
  - Priority: High. Owner: Operations. Effort: 1-2 days.
- Principal-admin hash stability standalone script did not complete in current runtime.
  - Evidence: script refused E2E seeding because `MYTITAN_RUNTIME_ENV` was not an allowed non-production value.
  - Risk: standalone evidence pack has a missing item, although E2E recovery/security coverage passed.
  - Action: rerun in an explicitly marked validation/e2e environment, or add a no-seed production hash verification mode.
  - Priority: Medium. Owner: Security Engineering. Effort: 0.5 day.

## Scores

- Engineering Score: 92/100. Deduction: remaining external prerequisites and one standalone script evidence gap.
- Security Score: 93/100. Deduction: formal ASVS evidence and principal-admin hash script completion still required.
- Architecture Score: 94/100. Deduction: existing legacy route names still exist but are covered by route/action E2E.
- Reliability Score: 91/100. Deduction: external uptime monitor not configured.
- Performance Score: 93/100. Deduction: bundle budgets pass, but no load-test/API latency evidence was produced in this pass.
- Accessibility Score: 88/100. Deduction: responsive and keyboard checks passed, but no formal WCAG AA audit evidence.
- Operational Score: 90/100. Deduction: external monitor and provider-side evidence missing.
- Compliance Readiness Score: 72/100. Deduction: formal certification evidence requires legal/compliance work outside source control.
- Launch Readiness Score: 88/100. Deduction: external monitor, legal/compliance, and provider evidence remain.
- Overall Engineering Score: 90/100.

## Final Classification

The source-controlled changes and validation evidence support a code-ready release candidate with no known critical code-controlled security findings after this pass. Public launch approval should remain gated on the external uptime monitor, formal legal/compliance evidence, and provider-side operational evidence.
