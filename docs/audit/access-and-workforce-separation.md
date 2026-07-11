# Access and Workforce Separation Audit

Date: 2026-07-11

## Root Cause

MyTitan historically used `User.role` as both the system-access model and the workforce-eligibility model. That made owners, admins, staff, and technicians easy to list together, but it also allowed system users to appear in scheduling and assignment surfaces even when they were not real field staff.

## Source Model

- `User.role` controls authorised system access.
- `User.isActive` controls whether the account can participate.
- `User.isStaffMember` controls whether the user is part of the operational workforce.
- `User.isSchedulable` controls rota, availability, capacity, and calendar staff visibility.
- `User.isAssignable` controls job and booking assignment eligibility.
- `User.appearsOnRota` controls staff rota and capacity display.
- `User.appearsInBookingAssignment` controls customer/public booking employee choices.
- `User.workforceAccessType` records employee, contractor, or guest workforce type.
- `User.defaultLocationId` and `User.skillsJson` remain optional eligibility context.

## API

- `GET /users` returns access and workforce participation fields.
- `PATCH /users/:id/role` remains the system-access role path.
- `PATCH /users/:id/workforce` updates workforce participation and writes `user.workforce.update`.
- Schedule and calendar APIs filter on active, schedulable, and rota-visible users.
- Booking assignment APIs filter on active, assignable, and booking-assignment-visible users.

## UI

- Team management owns staff/workforce switches.
- Role controls remain separate from workforce switches.
- Owners/admins keep system access without becoming schedulable by default.
- Staff/technician users retain scheduling behavior through the migration.

## Scheduling Filters

- Rota and availability: `isActive && isSchedulable && appearsOnRota`.
- Assignment suggestions: `isActive && isAssignable`.
- Public booking employee selection: `isActive && isSchedulable && appearsInBookingAssignment`.

## Booking Assignment

Booking service assignment validates explicit assignability. A system-only owner/admin is rejected unless explicitly made staff and assignable.

## Calendar and Rota Display

Calendar staff selectors, rota schedules, capacity, and suggestions no longer derive eligibility from `OWNER` or `ADMIN` role.

## Default Values

- New users default to system access only.
- Existing active `STAFF` and `TECHNICIAN` users are migrated as staff, schedulable, assignable, rota-visible, and booking-assignment-visible.
- Existing active `EXTERNAL_OPERATOR` users are migrated as contractor staff assignable for authorised assigned-work contexts, but not schedulable by default.
- Owners, admins, finance, viewers, and read-only users remain unschedulable unless explicitly enabled.

## Migration Implications

The migration adds explicit fields without deleting assignments, jobs, bookings, invoices, media, or historical schedule records.

## Existing Data Safety

No owner/admin access is removed. Existing job assignments are preserved. The change only affects future selector eligibility and assignment validation.
