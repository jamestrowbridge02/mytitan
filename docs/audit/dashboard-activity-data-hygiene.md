# Dashboard Activity Data Hygiene

Date: 2026-07-12

## Root Cause

`GET /activity/recent` accepted an optional `tenantId` query and the Dashboard called `/activity/recent?limit=6` without a tenant. Without authenticated tenant derivation, the endpoint could return globally recent events. That allowed E2E/validation records from another tenant to appear in a normal tenant-facing Dashboard.

## Fix

- `ActivityController` now requires JWT authentication.
- Recent activity derives tenant scope from `CurrentUser.companyId`; client-supplied tenant scope is no longer accepted for the tenant Dashboard API.
- Event creation endpoints derive `tenantId` from the authenticated user.
- `ActivityService.getTenantActivity` is now the tenant Dashboard query path. It requires an authenticated company ID, requires `tenantId` equality, applies tenant-visible scope checks, and verifies referenced job/customer subjects still belong to the same company.
- Tenant activity filtering uses structured `payloadJson` ownership and fixture markers (`activityScope`, `tenantVisible`, `fixture`, `e2e`, `validation`, `demo`, `source`, `environment`). It does not rely on display-label text matching.
- Tenant users cannot opt into validation activity through Dashboard query parameters. Platform and validation activity must use separate explicit query paths.
- Event creation rejects missing tenant ownership, missing job subjects, customer/company mismatches, job/company mismatches, and structured validation fixture creation in production runtime.

## Production Safety

No records are deleted by this change. If production is suspected to contain test-only rows, use an operator-reviewed production operation:

1. Run a read-only query for activity rows with fixture/validation payload markers and ownership scope fields.
2. Export row IDs, tenant IDs, timestamps, labels, and payload marker fields as evidence.
3. Confirm tenant ownership and whether the rows are production customer data or test contamination.
4. Prepare a reviewed cleanup migration or archival operation.
5. Execute only after explicit production approval.

## Residual Risk

Legacy rows without structured payload markers are no longer classified by display text in the tenant query. Operator cleanup must therefore use immutable ownership evidence, fixture metadata, environment markers, source system evidence, and subject ownership checks rather than label matching alone.
