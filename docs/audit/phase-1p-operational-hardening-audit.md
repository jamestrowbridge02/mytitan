# Phase 1P operational hardening audit

Date: 2026-06-04

## Zero-skip audit

The stable validator had one actual skipped test: the login `demo_token` coverage skipped when public demo mode was enabled. The root cause was environment-dependent coverage for the same route. The safe fix was to keep one deterministic test and branch assertions based on the public demo flag:

- demo disabled: the token is ignored and the user remains on login.
- demo enabled: the token is accepted by the public demo path and post-auth routing completes.

Rollback: restore the previous test body in `app/e2e/login-post-auth.spec.ts` if the public-demo product decision changes. Do not reintroduce a skip; split into two explicit mocked environments instead.

Conditional `test.skip(!hasDashboardAuth())` guards remain in authenticated specs as local-run safety guards. They do not skip in the seeded stable validator and are not counted as skipped coverage in the release run.

## External uptime readiness

Previous state was binary: no declaration meant `not_configured`, any declaration reported as ready. That was too optimistic.

The external monitor script now reports:

- `not_configured`
- `configured`
- `verifying`
- `healthy`
- `degraded`

Identifiers are non-secret only. No provider API token is required or printed. `healthy` is only reported when an operator-controlled state explicitly says the external provider is healthy.

Rollback: remove `MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE` from the host environment to return to `configured`, or remove all external monitor declaration variables to return to `not_configured`.

## Job pack 3 readiness

Pack 3 remains the catalog blocker. The product must stay `setup_required` until the platform catalog has a valid 50-job product/price mapping, expected GBP amount, active product/price, webhook credit grant readiness, hardcoded Stripe key guard success, and `MYTITAN_CONFIRM_JOB_PACK_CHECKOUT=1`.

Safe remediation:

1. Platform admin opens the billing catalog.
2. Review `job_completion_pack_3`.
3. Enter the product ID, price ID, lookup key, expected GBP amount, and currency.
4. Run dry-run validate.
5. Save with a human reason only after dry-run status is ready.
6. Run job-pack sync again.

No Stripe products or prices should be created by this application unless an explicit allow-create release step is approved.

## Technical debt sweep

The exact technical-debt marker scan across app, api, scripts, docs, and marketing returned no active markers. Broad feature-sprawl cleanup was intentionally avoided because the worktree contains extensive prior phase changes and unrelated generated/deleted files.

## Accessibility and operational trust

Phase 1P added focused regression coverage for:

- zero-skip login behavior,
- external monitor setup guidance,
- secret-free production readiness output,
- pack 3 readiness transparency,
- tenant/platform operational separation.

No billing, payment, tenant, or accounting behavior was relaxed.
