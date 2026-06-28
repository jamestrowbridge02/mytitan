# Server Defragmentation Audit

Date: 2026-06-28

## Duplicated Areas Found

- Platform dependency configuration was split between `/platform`, `/platform/configuration`, Autopilot, production readiness scripts, and tenant settings operations. The action-led owner is now Platform Admin Infrastructure.
- Email readiness existed as runtime environment checks plus Platform Admin email-control status, but without a platform-admin editable provider store.
- Stripe logic was split correctly by domain, but the UI label made MyTitan billing and Stripe Connect look like one payment setup surface.
- Monitoring readiness was duplicated across internal monitoring, external monitoring scripts, Autopilot, and production readiness. Internal monitoring remains runtime health; external monitor config is owned by Infrastructure.
- Commercial cleanup risk was concentrated in seed/reset helpers that used `deleteMany` for E2E data. Helpers now fail closed for non-`e2e-*` workspace ids.

## Safely Consolidated Areas

- `/platform/infrastructure` is the authoritative Platform Admin home for Email, Stripe Connect, MyTitan Billing Stripe, Monitoring, Backups, Storage, DNS/Sender Identity, Security, Runtime, Database/Redis/Scheduler, Integrations, and Vault/Secrets.
- `/platform/configuration` remains as a compatible legacy route that renders the same Infrastructure implementation.
- Email Provider configuration has a dedicated `PlatformEmailProviderConfig` store. Secrets are encrypted and only presence/last-four metadata is returned.
- External monitoring configuration has a dedicated `PlatformExternalMonitorConfig` store. Manual verification can record verifying/degraded states; healthy requires external evidence.
- Platform Admin navigation now exposes one Infrastructure entry instead of separate Payments and Configuration entries.

## Deferred Areas

- Billing catalog verification and job-pack sync remain release-validation commands because they intentionally inspect Stripe without mutating tenant customer payments.
- Backups, storage, security, runtime, database, Redis, scheduler, integrations, and vault cards are action-led summaries; deeper provider-specific configuration should be added only when a real source of truth exists.
- Broad controller/service refactors were deferred to avoid risky public API changes during a rationalisation pass.

## Deleted Dead Files

- No server files were deleted. No uncertain dead code was removed.

## Risk Notes

- Real email credentials are still required before public launch. Env-backed email remains read-only; vault-backed email is editable by platform admins.
- External uptime remains `not_configured` or `verifying` unless the external monitoring evidence source reports healthy.
- Stripe Connect is still isolated from MyTitan Billing Stripe. Tenant customer money must continue through tenant-owned Stripe Connect only.
- Existing baseline validation was not clean in this workspace because platform-admin login failed before this change.

## Route Ownership Map

- `/admin/platform/email-control`: platform email safety, delivery log, pause/resume, redacted health.
- `/admin/platform/email-control/provider`: platform email provider save and encrypted config status.
- `/admin/platform/email-control/provider/verify`: platform email provider readiness verification.
- `/admin/platform/platform-configuration/payment-providers`: MyTitan Billing Stripe status and Stripe Connect status.
- `/admin/platform/platform-configuration/payment-providers/stripe-connect`: Stripe Connect vault-backed credential save.
- `/admin/platform/platform-configuration/payment-providers/stripe-connect/verify`: Stripe Connect readiness verification.
- `/admin/platform/platform-configuration/payment-providers/stripe-connect/preflight`: tenant onboarding preflight without creating connected accounts.
- `/admin/platform/infrastructure/external-monitor`: external monitor configuration and redacted evidence status.
- `/admin/platform/infrastructure/external-monitor/verify`: external monitor verification without faking healthy state.

## Source-of-Truth Map

- Email Provider: `PlatformEmailProviderConfig` when vault-backed, runtime environment when env-backed.
- Stripe Connect: `PlatformPaymentProviderConfig` with runtime environment fallback.
- MyTitan Billing Stripe: runtime environment plus billing catalog verification scripts.
- External Monitoring: `PlatformExternalMonitorConfig` plus `scripts/external-monitoring-status.sh` evidence.
- Internal Runtime: `getInternalMonitoringSnapshot`, healthcheck, and Autopilot sentinel evidence.
- Backups: `scripts/backup-readiness-status.sh` and restore drill evidence.
- Commercial data preservation: archive/inactive lifecycle states and E2E-only seed guardrails; no automatic deletion of tenants, trials, bookings, invoices, payments, communications, evidence, Stripe mappings, or portal records.
