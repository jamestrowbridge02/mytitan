# Activity Contamination Cleanup Runbook

Date: 2026-07-12

## Purpose

Provide a safe operator-reviewed path for removing or quarantining activity rows that are proven to be validation, demo, platform, or cross-tenant contamination in tenant-visible production data.

## Rules

- Do not delete unknown records.
- Do not select records by label text alone.
- Do not remove legitimate tenant activity.
- Do not run without an operator, reason, target, evidence, dry run, and explicit confirmation.
- Preserve audit evidence before and after cleanup.

## Evidence Required

For each candidate row, collect:

- activity event ID;
- `tenantId`;
- structured payload scope and visibility fields;
- fixture/demo/validation/environment markers;
- validation fixture company ownership markers;
- referenced job/customer IDs and their company ownership;
- creation source where available;
- timestamp;
- actor type or service source where available.

## Dry Run

Use the production-operation framework to produce a dry-run report that lists only immutable identifiers and marker fields. The dry run must show:

- number of candidate rows;
- why each row is considered contamination;
- why the row is not legitimate tenant activity;
- proposed action: quarantine, mark non-tenant-visible, or delete only when policy explicitly permits deletion.

## Confirmation

Require an explicit operator confirmation containing:

- operator identity;
- incident or change reference;
- target environment;
- candidate row count;
- selected action;
- acknowledgement that legitimate tenant records are excluded.

## Preferred Remediation

Prefer non-destructive quarantine where schema support exists:

- set structured visibility to non-tenant-visible;
- move platform rows to platform scope;
- attach cleanup evidence to the production operation log.

Deletion should be reserved for records proven to be validation fixtures and approved by the production data-retention policy.

## Post-Check

After approved remediation:

- rerun the read-only ownership audit;
- verify tenant Dashboard activity only returns tenant-owned records;
- verify Platform Admin surfaces still expose platform activity to authorised users;
- attach before/after counts to the operation record.
