# Dashboard Activity Tenant Isolation Root Cause

Date: 2026-07-12

## Flow Traced

- Page: tenant Dashboard Recent Activity.
- Client request: `GET /activity/recent?limit=...`.
- API route: `ActivityController.recent`.
- Service path before this hardening: `ActivityService.list(limit, tenantId, filters)`.
- Data model: `ActivityEvent` stores `tenantId`, optional `customerId`, optional `jobId`, display fields, and `payloadJson`.

## Root Cause

The earlier dashboard fix moved the tenant source from a query parameter to the authenticated JWT company, but the underlying service still had an ambiguous `list` method that could be called with optional tenant ownership. It also allowed `includeValidation` as a tenant-facing query option and used legacy display-text matching as a fallback to detect seeded or E2E rows.

That meant the security boundary was not explicit enough:

- tenant activity, platform activity, support activity, and validation activity shared one query surface;
- validation visibility could be influenced by a request parameter;
- rows with ambiguous or mismatched subject ownership were not rejected at creation;
- legacy filtering could depend on labels such as fixture names, which is not authoritative.

## Corrected Predicate

Tenant Dashboard activity now uses `getTenantActivity(companyId, limit, filters)` and requires all of the following:

- authenticated `companyId` is present;
- `ActivityEvent.tenantId` equals the authenticated company;
- structured payload scope is tenant-visible;
- structured validation/demo/fixture markers are absent;
- the known validation fixture company is treated as validation-scoped outside production unless an event is explicitly marked tenant-visible by the authenticated tenant API path;
- platform and system operational scopes are excluded;
- support-session events are excluded unless explicitly marked tenant-visible;
- referenced `jobId` belongs to the authenticated company;
- referenced `customerId` belongs to the authenticated company.

## Creation Safety

`ActivityService.push` now rejects activity creation when:

- no company ownership can be resolved;
- a referenced job does not exist;
- a referenced job belongs to a different company;
- a referenced customer does not belong to the resolved company;
- structured validation/demo/fixture markers are present in production runtime.

Platform activity has a separate `pushPlatformActivity` method that stores `tenantId = null`, `activityScope = PLATFORM_ACTIVITY`, and `tenantVisible = false`.

E2E seed-created `ActivityEvent` rows are now written with structured fixture ownership (`activityScope = VALIDATION_E2E_ACTIVITY`, `tenantVisible = false`, `fixture = true`, `validation = true`, `source = seed:e2e`, `environment = validation`). This prevents validation fixtures from depending on display labels for exclusion.

## Why The Observed Rows Passed Previously

The observed E2E/platform-looking rows could pass the historical flow when they were present in the broad activity table and either lacked reliable structured fixture metadata or were retrieved through a broad/ambiguous query path. The fix does not infer ownership from labels. It requires database ownership and structured visibility fields.

No sensitive record values are included in this document.
