# Top-1% Broader Pass TODO

## A) Tenant scoping audit + helper
- [ ] Add reusable helper for enforcing `companyId` scoping
- [ ] Convert unsafe `findUnique({ where: { id } })` to tenant-scoped queries
- [ ] Audit calendar/bookings/jobs/schedules/exceptions paths
- [ ] Add tests proving cross-tenant access fails

## B) Always-on hard conflicts
- [ ] Remove feature-flag bypass paths that allow overlap
- [ ] Keep warning/UX flags if needed but never allow double-booking

## C) DB-level enforcement
- [ ] Add Postgres exclusion constraint for overlapping bookings per (companyId, technicianId)
- [ ] Add/verify supporting indexes

## D) Concurrency + transactions
- [ ] Ensure create + reschedule are in a transaction with advisory lock
- [ ] Add concurrency test for race conditions

## E) Jobs bulk idempotency
- [ ] Ensure truly no-op when already satisfied
- [ ] Add test to ensure repeated identical request doesn’t mutate

## F) Docs + CI wiring
- [ ] Add docs: tenant + scheduling guarantees + error contract
- [ ] Ensure npm run test:scheduling is run in CI (or documented)

