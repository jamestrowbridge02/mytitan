# Phase 11B real UI acceptance

Date: 2026-06-18

Acceptance standard: a checked item requires a browser interaction against the rebuilt app and API. Mock-only coverage is listed separately and is not treated as live proof.

## Live interaction proof

- [x] Reconnect Stripe clicked.
  - Result: the backend handled the request and returned tenant-safe reconnect guidance because this environment could not create a live Stripe account-link session.
  - Audit evidence: `billing.tenant_stripe_connect.onboarding_guidance`.
  - No empty drawer, page jump, silent failure, or tenant-facing platform diagnostic appeared.
- [x] Verify setup clicked.
  - Result: the backend ran verification, the UI showed `Stripe setup needs attention`, and readiness was read back.
  - Audit evidence: `billing.tenant_stripe_connect.verify_failed`.
- [x] Test checkout clicked.
  - Result: the dedicated dry-run endpoint returned `Needs attention`; no payment, Checkout Session, or charge was created.
  - Audit evidence: `billing.tenant_stripe_connect.test_checkout`.
- [x] Disconnect Stripe clicked and confirmed.
  - Result: the backend disabled the tenant-owned customer-payment connection, invalidated readiness, and the UI/readback changed to `Not connected`.
  - Audit evidence: `billing.tenant_stripe_connect.disconnect`.
- [x] Back to Payments & Invoices navigates to `/dashboard/settings/payments`.
- [x] Light theme visibly changes the app and Stripe page.
- [x] Dark theme visibly changes the app and Stripe page.
- [x] System theme follows browser/OS light and dark preference changes.
- [x] Theme persists after refresh.
- [x] Theme persists after a new authenticated session through tenant settings.
- [x] Stripe and Payments pages are readable and overflow-free in saved light and dark themes.
- [x] No visible dead support copy appears on the Stripe setup page.
- [x] No visible Stripe action silently does nothing.
- [x] No numbered Stripe setup blocks remain on the Stripe setup or Payments page.
- [x] No duplicate Stripe setup action panel remains on Payments & Invoices.

## Automated evidence

Focused command:

`PLAYWRIGHT_SKIP_DOCKER_SEED=1 npm run test:e2e:docker -- e2e/customer-field-consistency.spec.ts e2e/phase-11-launch-design.spec.ts e2e/payments-hardening.spec.ts`

Result: `22 passed, 0 failed, 0 skipped`.

Final stable command:

`bash ./scripts/validate-e2e-stable.sh`

Final result: `418 passed, 0 failed, 0 skipped, 0 flaky`.

Coverage includes:

- reconnect visible success/failure behavior;
- verify visible readiness behavior;
- dedicated checkout dry-run behavior;
- live disconnect and `Not connected` readback;
- no MyTitan Stripe customer-money fallback;
- customer profile baseline regression repair;
- light, dark, and system theme application;
- theme persistence after refresh and re-authentication;
- payment surface contrast and horizontal-overflow checks;
- no secret-bearing Stripe values in tenant responses.

## Stripe environment limitation

This environment did not create a live Stripe Connect account-link session during acceptance. Customer deposits remain blocked unless and until the tenant-owned Stripe account is successfully verified with the correct Stripe Connect platform configuration. No claim is made that live customer checkout works.
