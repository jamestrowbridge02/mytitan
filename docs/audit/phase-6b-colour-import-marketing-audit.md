# Phase 6B Colour, Import, and Launch Audit

Date: 2026-06-06

## Baseline

- Stable validator before Phase 6B changes: 356 passed, 0 skipped, 0 failed.
- Billing, security, tenant boundaries, support mode, and platform/tenant separation were green.
- External uptime monitoring remains intentionally deferred and is not represented as configured.

## Colour Audit

Before Phase 6B, `JobTag` and `CustomerTag` had optional colour fields. Services, suppliers, users, and locations did not.

Phase 6B adds nullable, tenant-owned colour fields to:

- `Service.color`
- `StockSupplier.color`
- `User.color`
- `Location.color`

Controls:

- owner/admin write access through `settings.manage`
- tenant-filtered lookup before every update
- strict `#RRGGBB` validation
- reset to default by storing `null`
- audit events for update and reset
- visible text labels alongside colour indicators
- accessible system defaults and a labelled job-status legend
- calendar accents prefer service, then technician, then location colour while status text and status tone remain authoritative

Default colours:

- service: `#2563EB`
- supplier: `#7C3AED`
- team member: `#0F766E`
- location: `#C2410C`

## Import Audit

Before Phase 6B, the setup wizard described an import planner and rendered a permanently disabled commit button. There was no import-batch persistence, commit, rollback, or error export.

Phase 6B adds:

- local CSV upload and quote-aware parsing
- explicit column mapping
- required-field validation
- invalid-colour validation
- duplicate detection inside the CSV and against tenant records
- persisted preview batches
- transactional create-mode commit
- rollback of records created by a committed batch
- imported, failed, and skipped counts
- CSV error report download
- tenant-scoped batch history
- preview, commit, and rollback audit events

Supported create imports:

- customers
- services
- locations
- inventory
- suppliers
- team-member invitations
- jobs
- historical invoice records

Safety boundaries:

- preview is mandatory before commit
- update mode is a separate, blocked path until explicit overwrite mappings and previous-value rollback exist
- imports never mutate Stripe
- payment imports are not supported
- historical invoice imports do not mark payments or call a payment provider
- team-member imports create expiring invitation records, not active users with fabricated passwords
- rollback deletes only record IDs stored by the selected batch and re-applies tenant filters

## Production Boundary Recheck

- No external uptime monitor was configured.
- No checkout gate was changed.
- No provider credential, secret, token, SMTP value, webhook secret, private URL, or internal host is exposed.
- Tenant roles outside owner/admin cannot write colours or execute imports.
- Import and colour actions are auditable.
- Platform-only controls remain outside tenant routes.

## Deliberate Remaining Gate

CSV update mode remains blocked. Enabling it requires field-level overwrite consent, previous-value snapshots, conflict detection, and rollback tests. This is safer than silently treating create-mode import as an updater.
