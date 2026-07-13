# Communications Functionality Preservation Matrix

| Current action | Current location | Route/API | Permission | Data source | New placement | Status | Test coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| View customer communication rows | Communications thread list | `GET /notifications/comms?scope=tenant` | `OWNER`, `ADMIN`, `STAFF`, `READ_ONLY` | `Notification` | Threads queue | Preserved and filtered by event class | `app/e2e/communications-hub.spec.ts` |
| Filter by channel | Communications filters | Client filter over `/notifications/comms` rows | Same as page | `Notification.metaJson.channel` | Toolbar channel filter | Preserved | E2E updated |
| Filter by status | Communications filters | Client filter over `/notifications/comms` rows | Same as page | `Notification.metaJson.status` | Toolbar status filter and chips | Preserved | E2E updated |
| View unread state | Thread row badge | `/notifications/comms` | Same as page | `Notification.isRead` | Thread row badge and snapshot | Preserved | E2E updated |
| View delivery issue | Thread/detail | `/notifications/comms` | Same as page | `Notification.metaJson.status` | Delivery issues view and detail status | Preserved | E2E updated |
| Open linked job/booking/customer | Thread detail | `/dashboard/jobs/:id`, `/dashboard/bookings/:id`, `/dashboard/trade-accounts/:id` | Route permissions | `Notification.entityType/entityId` | Row overflow and detail action | Preserved, raw ID hidden | Existing route coverage |
| Reply/send portal update | Detail panel | `POST /notifications/send` | `OWNER`, `ADMIN`, `STAFF` | `Notification`, linked record | Detail composer and message modal | Preserved | Existing send panel coverage |
| View channel readiness | Top readiness cards | `/tenant/settings/email-readiness` | Page access | Tenant settings/email readiness | Secondary Channels panel | Preserved and compacted | E2E updated |
| Manage message settings | Header action | `/dashboard/settings?tab=messages` | Settings route permissions | Tenant settings | Header secondary action and channels panel | Preserved | E2E updated |
| Manage email templates | Header action | `/dashboard/email-templates` | Route permissions | Email templates | Header secondary action | Preserved | E2E updated |
| Operational alert smoke test visibility | Previously in tenant list if recent | `/notifications/comms` | Page access | `Notification.metaJson.source` | Excluded server-side | Moved out of tenant inbox | API classification |
