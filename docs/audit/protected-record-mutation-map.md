# Protected Record Mutation Map

Generated: 2026-06-29

Scope: mutation paths that can write, update, upsert, or delete protected production records. This audit focuses on automation, validation, seed, cleanup, startup, migration-adjacent, and release evidence paths that could silently mutate production-like records.

## Protected Records

- Principal platform admin: `admin@mytitan.co.uk`
- Verified `@mytitan.co.uk` platform staff accounts
- Non-E2E tenants, trials, users, and customers
- Stripe/payment/provider configuration vault rows
- Email provider configuration rows
- Commercial records: trials, tenants, subscriptions, bookings, jobs, invoices, payments, communications, and evidence

## Shared Guard

The shared script guard lives in `api/scripts/protected-mutation-policy.js`.

It exposes:

- `assertE2eScope`
- `assertNotProtectedPrincipalAdmin`
- `assertNotCommercialRecordDelete`
- `requireExplicitAuditReason`
- `blockUnsafeMutation`
- `recordProtectedMutationWarning`

Blocked or preserved automation paths record safe entries in `PlatformSafeErrorLog` under `protected_mutation_guard`. Entries contain only action, target label, reason, and source reference. They must not contain passwords, hashes, tokens, provider secrets, or environment values.

## Seed Scripts

### `api/scripts/seed-e2e.js`

Risk before guard:

- Rewrote `admin@mytitan.co.uk` `passwordHash` on every E2E seed run.
- Could repair principal fields without a distinct protected-record audit trail.
- Rewrote verified `@mytitan.co.uk` fixture staff password hashes.
- Deleted `PlatformEmailProviderConfig(system_email)` and `PlatformExternalMonitorConfig(external_monitor)` during seed.
- Performs many `deleteMany` calls for jobs, bookings, services, locations, inventory, service plans, quotes, workflow, compensation, performance, customer accounts, approvals, artifacts, and evidence.

Guard result:

- Existing principal admin `passwordHash` is preserved by seed.
- Existing verified MyTitan staff password hashes are preserved by seed.
- Principal admin repair remains limited to safe active/verified/OWNER/platform-eligible state; password mutation is excluded.
- Platform email, monitor, and payment provider configuration rows are not deleted by seed.
- E2E cleanup paths continue to require explicit `e2e-*` tenant/workspace identifiers before deleting mutable fixture records.
- Guard activity is recorded without secrets in `PlatformSafeErrorLog`.

### `api/scripts/seed-sample.js`

Risk:

- Creates and updates sample tenants, users, jobs, notifications, trade records, and support defaults.
- Defaults `SUPPORT_EMAIL` to `admin@mytitan.co.uk`.

Policy:

- Do not run against production databases.
- If re-enabled for production-like environments, it must use `assertE2eScope` or an explicit audited tenant reason before any user, tenant, job, or commercial write.

### `api/scripts/seed-top1-baseline.mjs`

Risk:

- Upserts tenant settings and owner users with password hashes for a baseline workspace.

Policy:

- Treat as non-production unless every target tenant/user is explicit and audited.
- Must not target `admin@mytitan.co.uk` or verified MyTitan staff accounts.

### `api/scripts/seed-wheel-ar-pilot.js` and `api/scripts/seed-tenant-settings.js`

Risk:

- Mutate tenant settings, locations, business hours, booking questions, and pilot data.

Policy:

- Safe only for explicit tenant-scoped setup.
- Must not delete non-E2E commercial data.

## Cleanup and Validation Scripts

### `scripts/validate-e2e-stable.sh`

Risk:

- Runs `npm run seed:e2e`.
- Runs validation artifact cleanup scripts.

Guard result:

- Seed no longer overwrites principal admin or provider config.
- Artifact cleanup remains filesystem-only and does not delete database commercial records.

### `scripts/verify-principal-admin-hash-stability.sh`

Risk before guard:

- Directly deleted platform email and external monitor config rows as a cleanup simulation.

Guard result:

- No provider/email config rows are deleted.
- The script now delegates to `npm run auth:verify-principal-admin-immutability` and `npm run platform:verify-protected-records`.

### `scripts/cleanup-validation-artifacts.sh`

Risk:

- Removes local validation artifact files when called with `--apply`.

Policy:

- Safe for generated evidence/artifact directories only.
- Must not be extended to database cleanup without protected mutation policy checks.

### `scripts/cleanup-orphaned-playwright.sh`

Risk:

- Removes orphaned Playwright browser/process artifacts.

Policy:

- Process/artifact cleanup only; no database mutation.

## Release Evidence Scripts

### `scripts/create-release-evidence-package.sh`

Risk:

- Reads health, readiness, and evidence state for packaging.

Guard result:

- No protected database mutation is required.
- Hash stability verification checks that release evidence generation does not mutate the principal admin hash.

### Evidence and audit generators

Examples:

- `scripts/create-saas-ops-report.sh`
- `scripts/collect-api-contract-evidence.sh`
- `scripts/run-release-typechecks.sh`
- `scripts/run-dependency-security-scan.sh`
- `scripts/check-bundle-budgets.sh`
- `scripts/generate-architecture-docs.sh`

Policy:

- Evidence generators should write files only.
- They must not clear provider vault rows, email configuration, tenants, trials, jobs, bookings, payments, communications, or principal/staff users.

## Provider Configuration Paths

### `api/src/platform-config/platform-payment-provider-config.service.ts`

Allowed mutations:

- `save`: explicit platform-admin action with confirmation and audit event.
- `verify`: explicit verification action with audit event.
- `recordOnboardingCapability`: runtime status update only.
- `remove`: explicit platform-admin action with confirmation and audit event.

Policy:

- Seed, cleanup, release evidence, and validation automation must not delete provider config rows.
- Removal remains available only through explicit audited platform-admin path.

### `api/src/email/email.service.ts`

Allowed mutations:

- Platform-admin save/verify of email provider config with actor context.

Policy:

- Seed and cleanup automation must not clear `system_email`.

## Auth and Principal Admin Paths

### Normal authenticated and reset paths

Allowed paths:

- Normal authenticated password change.
- Forgot-password reset.
- Platform staff setup completion.
- Emergency command `auth:reset-principal-admin-password`.

Requirements:

- Every allowed path records an audit event.
- Output must not include password hashes, reset tokens, or supplied passwords.

### `api/scripts/reset-principal-admin-password.js`

Allowed:

- Explicit emergency command only, requiring `MYTITAN_PRINCIPAL_ADMIN_NEW_PASSWORD`.
- Uses `AuthService.resetPrincipalAdminPassword`.
- Records `principal_admin_password_reset`.
- Emits only safe status fields.

### `api/scripts/verify-platform-admin-runtime.js`

Guard result:

- Verifies principal admin exists, is active, verified, OWNER, and platform eligible.
- Does not require the E2E seed fixture password to match when the existing protected hash has intentionally drifted through an audited path.
- Does not print password hashes.

## Product Runtime Commercial Mutations

Normal runtime services still update tenant-owned records through authenticated application flows:

- `api/src/billing/billing.service.ts`: tenant subscriptions, customer payment requests, jobs, job packs, provider credentials, payment webhooks.
- `api/src/bookings`, `api/src/jobs`, `api/src/revenue`, `api/src/service-plans`, `api/src/customer-workspace`: bookings, jobs, quotes, service plans, customer accounts, approvals, evidence.
- `api/src/admin` and `api/src/platform-config`: platform-admin configuration and support workflows.

Policy:

- These are product paths, not automation cleanup paths.
- Destructive tenant/commercial operations must remain authenticated, tenant-scoped, and audited where applicable.
- Trials should be archived, paused, resumed, expired, or reactivated through explicit lifecycle controls, not removed by automation.

## Drift Detection

Added scripts:

- `npm run auth:verify-principal-admin-immutability`
- `npm run platform:verify-protected-records`

They verify:

- Principal admin exists once.
- Principal admin hash fingerprint is stable across `seed:e2e`.
- Principal admin active/verified/OWNER state is preserved.
- Verified MyTitan staff accounts are not downgraded.
- Provider/email/monitor config rows survive seed.
- Non-E2E commercial record counts are not reduced by seed.
- A protected delete attempt is blocked by the shared guard.

The scripts use internal comparisons only and do not print hashes, tokens, secrets, or environment values.
