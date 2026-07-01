# Platform Admin Tenant Action Audit

Generated: 2026-07-01

Scope: Tenant 360, tenant lookup, support mode, commercial controls, owner recovery, payment/provider readiness, and tenant-safe links.

## Summary

Platform Admin tenant actions are real API-backed controls or explicit actionable states. Tenant data access requires platform-admin RBAC. Tenant detail access requires a timed support-mode session with a reason. Write-mode support requires explicit confirmation. Tenant-owner recovery is platform-only, reason-gated, confirmation-gated, audited, and never returns reset tokens, passwords, hashes, payment secrets, or environment values.

Wheel A&R is protected production data. Validation tests exercise the same action contract against isolated E2E tenants; production verifiers confirm Wheel A&R and protected records remain stable.

## Action Matrix

| Action | Route | API endpoint | Required role/action | Audit event | UI result | Error state | Coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Tenant 360 | `/platform/tenants/:tenantId` | `GET /admin/platform/tenants/:tenantId/360` | Platform Admin, `platform.tenant_360.read` | Access denial is audited by platform-admin guard | Tenant health, commercial state, risk, timeline, and recovery panel render | Tenant user sees platform-admin forbidden state | `platform-admin-recovery.spec.ts`, `phase-15-product-craft.spec.ts` | Working |
| Tenant lookup | `/platform#lookup` | `GET /admin/platform/tenants?q=` | Platform Admin, `platform.tenants.lookup` | Access denial audited by guard | Results show Open Tenant 360, Edit Commercials, Start Support Mode, View Audit | Empty results show clear no-match text | `trial-and-platform-admin.spec.ts`, `pricing-adjustments.spec.ts` | Working |
| Start Support Mode | `/platform#lookup` | `POST /admin/platform/tenants/:tenantId/support-mode` | Platform Admin, `platform.support_mode.start` | `support_mode.started`, `support_mode.reason_recorded`, `support_mode.role_selected`, `support_mode.mode_selected` | Timed banner shows expiry, view role, access mode, reason | Missing reason or write confirmation returns 400 | `phase-4b-workflow-execution.spec.ts`, `platform-admin-recovery.spec.ts` | Working |
| View as Owner | `/platform#lookup` | `POST /admin/platform/tenants/:tenantId/support-mode` with `viewRole=owner` | Platform Admin | Same support-mode audit set | Banner shows Owner and read-only by default | No active session blocks tenant detail | `phase-4b-workflow-execution.spec.ts` | Working |
| View as Admin | `/platform#lookup` | `POST /admin/platform/tenants/:tenantId/support-mode` with `viewRole=admin` | Platform Admin | Same support-mode audit set | Banner shows Admin | Invalid role is normalized to owner | Covered by support-mode role contract | Working |
| View as Dispatcher/operator | `/platform#lookup` | `POST /admin/platform/tenants/:tenantId/support-mode` with `viewRole=operator` | Platform Admin | Same support-mode audit set | Banner shows Operator / service provider | Invalid role is normalized to owner | Covered by support-mode role contract | Working |
| View as Finance | `/platform#lookup` | `POST /admin/platform/tenants/:tenantId/support-mode` with `viewRole=finance` | Platform Admin | Same support-mode audit set | Banner shows Finance | Write mode requires confirmation | `platform-admin-recovery.spec.ts` | Working |
| Exit Support Mode | `/platform#lookup` | `DELETE /admin/platform/tenants/:tenantId/support-mode` | Platform Admin, `platform.support_mode.exit` | `support_mode.ended` | Banner clears and start panel returns | No active session returns safe no-op with `exited=false` | `phase-4b-workflow-execution.spec.ts`, `platform-admin-recovery.spec.ts` | Working |
| Edit Commercials | `/platform/tenants/:tenantId#commercial` | `PATCH /trial`, `PATCH /commercial-controls`, `POST/PATCH/DELETE /pricing-adjustment`, `PATCH /job-allowance` | Platform Admin commercial actions | Billing service writes before/after commercial audit events | Save buttons require reason/confirmation where applicable and show audit reference | API validation returns clear reason/confirmation errors | `platform-admin-recovery.spec.ts`, `pricing-adjustments.spec.ts`, `platform-commercial-controls-ux.spec.ts` | Working |
| View Audit | `/platform/tenants/:tenantId#audit` | `GET /admin/platform/tenants/:tenantId/360` | Platform Admin | Access denial audited by guard | Redacted timeline renders latest audit reference | Tenant user forbidden | `platform-admin-recovery.spec.ts` | Working |
| Send tenant-owner password reset email | `/platform/tenants/:tenantId#owner-recovery` | `POST /admin/platform/tenants/:tenantId/owner-recovery` with `action=send_reset_email` | Platform Admin, `platform.tenant_owner_recovery.execute` | `tenant_owner_password_recovery_requested`, `tenant_owner_password_recovery_completed` or `tenant_owner_password_recovery_refused` | Safe status and request ID; no token/password/hash | Email unavailable returns actionable status and server-reset guidance | `platform-admin-recovery.spec.ts` | Working |
| Server-side tenant-owner reset | `/platform/tenants/:tenantId#owner-recovery` | `POST /admin/platform/tenants/:tenantId/owner-recovery` with `action=server_reset_password` | Platform Admin, reason, confirmation, production phrase, temporary password | Requested, refused, or completed recovery audit events | Hidden password input; result shows request ID only | Missing phrase/password policy returns 400 and no mutation | `platform-admin-recovery.spec.ts` refusal path | Working, guarded |
| Reactivate/modify trial | `/platform/tenants/:tenantId#commercial` and `/platform#lookup` | `PATCH /admin/platform/tenants/:tenantId/trial` | Platform Admin, `platform.trial.update` | Billing trial audit events | Trial extension/pause/resume/expiry controls complete or return validation errors | Missing values rejected | `trial-and-platform-admin.spec.ts`, `platform-admin-recovery.spec.ts` | Working |
| Archive/reactivate tenant | N/A | N/A | N/A | N/A | No archive/reactivate tenant control is exposed | Action is intentionally absent rather than a dead button | Audit record documents absence | Not implemented |
| Open public booking page | Tenant settings/portal surfaces | Tenant public route links are generated from tenant settings | Tenant user or public route as applicable | Public route events are tenant-scoped | Links route to public booking/status when configured | Disabled booking shows clear unavailable state | `booking-public-flow.spec.ts`, `verification-and-bookings-state.spec.ts` | Working outside Tenant 360 |
| Open trade portal/page | Trade account surfaces | Trade portal routes use signed portal tokens | Tenant user or public token | Trade account events are tenant-scoped | Links route to trade portal/application when configured | Missing/invalid token rejected | `trade-accounts` E2E coverage | Working outside Tenant 360 |
| View payment readiness | `/platform#lookup`, `/platform/tenants/:tenantId` | `GET /admin/platform/tenants/:tenantId`, `GET /360` | Platform Admin plus support session for tenant detail | Support access audited where tenant detail is used | Payment/readiness values show tenant-owned state only | No support session blocks tenant detail | `payments-hardening.spec.ts`, `platform-admin-recovery.spec.ts` | Working |
| View provider config/readiness | `/platform/configuration`, `/platform/infrastructure` | `GET /admin/platform/platform-configuration/payment-providers` and related verify endpoints | Platform Admin provider-config actions | Provider verify/save/reload audit events | Redacted provider readiness only; no secrets | Tenant users forbidden | `platform-admin-recovery.spec.ts`, `settings-operations.spec.ts` | Working |

## Wheel A&R Notes

- Production tenant: `Wheel A&R`.
- Protected owner: `hello@wheelar.co.uk`.
- Recovery and support actions must be initiated by a Platform Admin with a reason and audit trail.
- Validation tooling must not mutate Wheel A&R; protected record verifiers cover hash and record-count stability.
- Last-resort password recovery must preserve owner role, active state, and email verification unless a separate explicit action changes them.

## Remaining Non-Dead Explicit Gaps

- Archive/reactivate tenant is not exposed as a Tenant 360 button. It is documented as not implemented instead of presenting a no-op.
- Full impersonated tenant dashboard rendering is still represented by audited support-mode tenant detail and banner state; deeper tenant UI write blocking should remain covered by support-mode contracts before any broader impersonation feature is added.
