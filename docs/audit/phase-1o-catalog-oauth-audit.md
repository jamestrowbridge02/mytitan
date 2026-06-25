# Phase 1O Catalog And OAuth Audit

## Scope

Phase 1O focused on commercially safe readiness rather than enabling live money or provider mutation:

- Job-pack catalog readiness recovery
- Platform-only job-pack mapping management
- Checkout readiness gating
- Tenant-owned Xero OAuth onboarding foundation
- Tenant-owned QuickBooks OAuth onboarding foundation
- Accounting setup UI clarity
- OAuth security and privacy checks

## Current Implementation

Job-pack definitions cover all six packs: 10, 25, 50, 100, 250, and 500 job completions. Platform billing catalog overrides can store product ID, price ID, lookup key, expected amount, currency, active state, verification state, and audit history. Normal tenant users receive sanitized job-pack readiness only.

The billing sync path remains dry-run/create-safe by default. Stripe product or price creation is still blocked unless the explicit create confirmation is present. Checkout remains blocked unless all active packs validate, webhook-backed granting is ready, hardcoded Stripe key guard is clean, and `MYTITAN_CONFIRM_JOB_PACK_CHECKOUT=1` is explicitly set.

Xero and QuickBooks OAuth onboarding now has tenant-scoped connect, callback, disconnect, and local health-check flows. Tokens are encrypted server-side and are not returned to frontend status or setup responses. Live accounting export remains blocked by accounting feature flags and provider-specific live-sync flags.

## Partial Or Blocked Areas

The current job-pack catalog sync still reports partial because one pack mapping is missing in the runtime Stripe catalog/configuration. This is intentional: the platform UI now shows the exact missing mapping and next action, but checkout remains `setup_required`.

Sage remains readiness-only. Xero and QuickBooks can establish tenant-owned OAuth connection state, but no live invoice, payment, or contact export is submitted unless verified provider setup and explicit live-sync flags are enabled.

## Conflict Risks

- Saving incomplete or inactive catalog mappings can make admin history clearer but does not make checkout ready.
- Older billing catalog history entries may not contain rollback targets with raw identifiers, so rollback is only available for mappings saved after rollback metadata was introduced.
- E2E OAuth fixtures are restricted to seeded `e2e-` tenants and must not be treated as provider readiness in production.

## Safe Bridge Strategy

- Keep all Stripe catalog changes platform-admin-only and audited.
- Keep all IDs masked by default.
- Use dry-run verification before saving mappings.
- Keep checkout blocked until explicit runtime confirmation is present.
- Store OAuth material encrypted server-side only.
- Return safe connection state, masked provider references, and business next actions to the UI.
- Keep live accounting sync behind `accounting_sync_v1`, `accounting_live_xero_v1`, and `accounting_live_quickbooks_v1`.

## Rollback Plan

- Revert a saved catalog mapping through platform rollback when the history entry has rollback metadata.
- Otherwise save a corrected mapping with a required reason and dry-run verification.
- Disconnect Xero or QuickBooks from the tenant integrations page to delete local credential state.
- Disable accounting live flags to stop any future live-sync bridge from running.
- Keep tenant billing checkout unavailable by leaving `MYTITAN_CONFIRM_JOB_PACK_CHECKOUT` unset.
