# Calendar Functionality Preservation Matrix

| Capability | Old location | New location | Permission/source data | Test coverage | Status | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Bookings calendar | Main Calendar page | Main calendar/timeline | `/calendar/bookings` | `calendar-productization.spec.ts` | Preserved | Core scheduling surface |
| Team rota | Operations command centre / planning toggle | Lens row and Mode selector | Scheduling data and workforce terminology | E2E lens assertions | Preserved | Canonical lens |
| Availability | Operations command centre | Lens row and Manage menu | Scheduling availability APIs | Existing schedule overlay tests plus typecheck | Preserved | Operational scheduling need |
| Capacity | Verbose capacity card | Snapshot metric and capacity lens | Existing availability/booked-minute calculations | E2E structure assertions | Preserved, simplified | Removes long permanent sentence |
| Assets | Operations foundation card | Lens row and Manage menu | Existing assets route | E2E structure assertions | Preserved, collapsed | Keeps access without large copy |
| Fleet | Operations lens | Lens row | Existing lens state | E2E structure assertions | Preserved | Keeps scheduling lens |
| Live map readiness | Route foundations card | Lens row and Manage menu Maps shortcut | Existing maps readiness route | E2E copy-reduction assertion | Preserved, collapsed | Avoids technical tenant-facing copy |
| Day/week/month | Calendar section controls | Compact toolbar | Local calendar state | `calendar-view-toggle-*` tests | Preserved | Same state transitions |
| Today/previous/next | Header/actions and section controls | Compact toolbar | Local calendar date state | E2E navigation coverage | Preserved | Avoids duplicated date controls |
| Location filtering | Filter bar/location cards | Scope selector and location workload buttons | Calendar block location IDs | E2E/filter tests | Preserved | Tenant boundary unchanged |
| Workforce filtering | Filter bar | Scope selector | Calendar technicians | E2E/filter tests | Preserved | Uses configured terminology |
| Search | Filter bar with long placeholder | Filter bar with `Search bookings...` | Existing client-side search fields | `calendar-productization.spec.ts` | Preserved | Placeholder simplified |
| Status filters | Saved views | Main calendar surface | Existing `STATUS_FILTERS` | Existing E2E coverage | Preserved | No behavior change |
| Unassigned filter | Saved views/status filter | Main calendar surface | Existing status filter logic | Existing E2E coverage | Preserved | No behavior change |
| Warnings | Separate missing cover and actionable warning areas | One warning summary | Existing booking warnings and booking mode | E2E duplicate-warning assertion | Preserved, merged | Removes repeated zero-state messages |
| Booking queue | Quick rail card | Header action and Manage menu | Existing bookings route | E2E visible action coverage | Preserved, collapsed | Access retained |
| Workflow rules | Quick rail card | Manage menu | Existing booking settings route | E2E visible action coverage | Preserved, collapsed | Setup remains accessible |
| Availability management | Quick rail card | Manage menu | Existing scheduling route | E2E visible action coverage | Preserved, collapsed | Setup remains accessible |
| Drag/drop | Calendar grid | Calendar grid | Existing reschedule API | `rescheduling a booking...` | Preserved | Grid internals unchanged |
| Undo/confirmation | Calendar grid toast | Calendar grid toast | Existing reschedule handlers | Existing E2E coverage | Preserved | Handler unchanged |
| Empty states | Verbose card | Concise card | Filtered calendar state | `calendar-empty-state` tests | Preserved, simplified | Reduces copy |
| Mobile behavior | Existing responsive grid | Compact wrapping controls and existing grid | CSS responsive rules | Regression tests and manual review steps | Preserved | Avoids horizontal control overflow |
