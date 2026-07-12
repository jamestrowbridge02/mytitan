# Dashboard Activity Data Hygiene

Date: 2026-07-12

## Root Cause

`GET /activity/recent` accepted an optional `tenantId` query and the Dashboard called `/activity/recent?limit=6` without a tenant. Without authenticated tenant derivation, the endpoint could return globally recent events. That allowed E2E/validation records from another tenant to appear in a normal tenant-facing Dashboard.

## Fix

- `ActivityController` now requires JWT authentication.
- Recent activity derives tenant scope from `CurrentUser.companyId`; client-supplied tenant scope is no longer accepted for the tenant Dashboard API.
- Event creation endpoints derive `tenantId` from the authenticated user.
- `ActivityService.list` defaults to hiding validation-style activity using structured `payloadJson` markers (`fixture`, `e2e`, `validation`, `source`, `environment`) and a legacy fallback for already-seeded validation rows.
- Callers that need validation activity for diagnostics must opt in with `includeValidation=1`.

## Production Safety

No records are deleted by this change. If production is suspected to contain test-only rows, use an operator-reviewed production operation:

1. Run a read-only query for activity rows with fixture/validation payload markers and legacy E2E references.
2. Export row IDs, tenant IDs, timestamps, labels, and payload marker fields as evidence.
3. Confirm tenant ownership and whether the rows are production customer data or test contamination.
4. Prepare a reviewed cleanup migration or archival operation.
5. Execute only after explicit production approval.

## Residual Risk

Legacy rows without structured markers can only be identified by conservative fallback patterns. New activity creation should use structured markers for validation events.

