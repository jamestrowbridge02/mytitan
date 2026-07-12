# Bookings Functionality Preservation Matrix

| Previous capability | New location | Permission/source | Status | Test coverage |
| --- | --- | --- | --- | --- |
| Bookings route | `/dashboard/bookings` | Existing route/RBAC | Preserved | dashboard workflows, mobile shell |
| Create booking form | `Create booking` panel | `/bookings`, booking services | Moved | dashboard workflows, phase-11c |
| Add service to booking | Creation panel | `/booking/services` | Preserved | dashboard workflows |
| Service pricing snapshot | Creation panel submit | `/bookings` server validation | Preserved | dashboard workflows |
| Booking queue | Primary page section | `/bookings` | Preserved | dashboard workflows |
| Search | Queue toolbar | Client filter over loaded queue | Preserved | mobile shell |
| Status filter | Queue toolbar | Existing statuses | Preserved | dashboard workflows |
| Timing/view filters | Queue tabs and toolbar | Existing booking dates/job links | Preserved | dashboard workflows |
| Reset filters | Queue toolbar/empty state when active | Client filter state | Preserved with disclosure | dashboard workflows |
| Convert to job | Row primary/overflow action | `/bookings/:id/convert` | Preserved | dashboard workflows, public flow |
| Blocked conversion visibility | Row status/job link copy | Conversion readiness checks | Preserved | dashboard workflows |
| Open booking detail | Row link/overflow | `/dashboard/bookings/:id` | Preserved | dashboard workflows |
| Open linked job | Row primary/overflow | Existing job link | Preserved | dashboard workflows |
| Schedule/open calendar | Header and row overflow | `/dashboard/calendar` | Preserved | dashboard workflows |
| Bulk copy IDs/customers | Bulk bar | Selected queue rows | Preserved | dashboard workflows |
| Custom fields | Row overflow and custom field card | Custom fields APIs | Preserved | dashboard workflows |
| Public booking status | Compact public booking card | `/bookings/settings` | Moved | booking settings persistence |
| Preview public booking | Public booking card | `settings.publicUrl` | Preserved | booking settings persistence |
| Copy public link | Public booking card | Clipboard/public URL | Preserved | booking settings persistence |
| ICS feed | Public booking card when available | `settings.icsUrl` | Preserved | booking settings persistence |
| Manage booking settings | Header and public booking card | `/dashboard/booking/settings` | Preserved | booking settings persistence |
| Notifications shortcut | Public booking card | `/dashboard/settings?tab=messages` | Preserved | booking settings persistence |
| Legacy feature flag compatibility | Same route | Tenant settings | Preserved | dashboard workflows |
