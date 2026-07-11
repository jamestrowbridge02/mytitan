# Draft Retention and Delete Policy

Date: 2026-07-11

## Eligible Drafts

Live Work draft delete applies only to unsubmitted job-sheet drafts stored in `JobDraft` for the current tenant and current user.

## Not Eligible

The draft-delete path must never delete submitted jobs, completed jobs, bookings, invoices, paid records, uploaded authoritative job media, or customer records.

## Confirmation

The UI must show the draft type, last updated time, and consequence before deletion.

## Audit

Successful deletion writes `work_draft_deleted`.

## Retention

Temporary autosave data may be removed with the draft. Authoritative media and records remain governed by their own retention policies.

## Restore

Undo is not shown because deletion is hard delete for the current autosave draft. A reversible undo may be added only if draft deletion becomes soft-delete.
