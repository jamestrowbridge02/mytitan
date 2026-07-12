# Dashboard Functionality Preservation Matrix

Date: 2026-07-12  
Route: `/dashboard`

| Previous capability | New location | Permission | Source data | Test coverage | Status | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard route loads inside authenticated shell | `/dashboard` | Authenticated tenant user | Dashboard shell, `/me` | `dashboard-workflows.spec.ts` | Preserved | Same route retained |
| Notification bell, unread count, mark all read | Dashboard shell | Existing notifications access | `/notifications`, `/notifications/read-all` | `dashboard-workflows.spec.ts` notification drawer | Preserved | Shell remains unchanged |
| Create/start work | Header primary action `/dashboard/jobs/new?guided=1&entry=dashboard` | Job route access | Static route | Dashboard layout tests | Preserved | One clear primary action |
| Open Live Work | Live work section, `View all live work` | Existing route access | Tenant settings `getCommandCentreHref` | Dashboard layout tests, Live Work tests | Preserved | Canonical queue link remains |
| Continue job draft | Today’s priority or Live work row | Draft owner/job route access | `/command-centre/summary.drafts.jobs` | Live Work draft tests | Preserved | Direct resume link retained |
| Delete eligible draft | `/dashboard/work` draft confirmation | Draft owner/backend draft policy | `/drafts/:id` from Live Work | Existing Live Work draft deletion coverage | Preserved/moved | Destructive action stays with confirmation and audit behavior |
| CRM draft continuation | Live work row link | CRM route access | `/command-centre/summary.drafts.crm` | Existing dashboard route coverage | Preserved | Link retained |
| Bookings today count | Business snapshot | Booking route access | `/command-centre/summary.todayBookings` | Dashboard KPI tests | Preserved | Promoted as first snapshot card |
| Today’s schedule rows | Today’s schedule | Booking route access | `/command-centre/summary.todayBookings` | Dashboard layout tests | Preserved | Rows now first-class |
| Open full calendar | Today’s schedule heading | Existing calendar route access | Static route | Dashboard layout tests | Preserved | Direct source link |
| Live jobs count | Business snapshot and Live work tabs | Job route access | `/command-centre/summary.dueAndOverdueJobs` | Dashboard KPI tests | Preserved | Source count remains |
| Due/overdue job access | Live work rows | Job route access | `/command-centre/summary.dueAndOverdueJobs` | Dashboard layout tests | Preserved | Direct job links |
| Completed work handoff | Today’s priority or Live work rows | Job route controls | `/command-centre/summary.dueAndOverdueJobs` | Existing job lifecycle coverage | Preserved | Contextual rather than duplicated |
| Revenue today | Business snapshot when authorised | `billing.manage` | Existing summary revenue fields | Dashboard KPI tests | Preserved | Hidden for unauthorised users |
| Unpaid jobs count/value | Awaiting payment tab and billing links | `billing.manage` for billing values/pages | `/command-centre/summary.unpaidJobs`, `money` | Billing readiness tests | Preserved | Finance access protected |
| Payment follow-up | Today’s priority or Billing readiness | `billing.manage` | `/command-centre/summary.unpaidJobs` | Billing readiness tests | Preserved | Contextual priority |
| Team/technician activity count | Business snapshot | Technician route permission where route is used | Existing active technician summary fields | Dashboard KPI tests | Preserved | Uses configured workforce terminology |
| Pending approvals | Snapshot replacement where visible | `portal.manage` | Existing summary approval fields | Dashboard KPI tests | Preserved | Permission-aware replacement |
| Setup progress | Launch Control / Settings, or priority if strongest | `settings.manage` | `/setup/checklist` | Setup wizard tests | Preserved/moved | Owner setup moved to canonical pages |
| Recommended setup action | Today’s priority only when strongest | Route permission filter | `/setup/checklist` | Dashboard priority tests | Preserved/merged | No duplicate next-action sections |
| Owner setup shortcuts | Sidebar, Settings, Help/account menu, or contextual priority | `settings.manage`, `billing.manage` | Static canonical routes | Settings/launch tests | Preserved/moved | Removed loose permanent dashboard footer links |
| Useful areas navigation | Global navigation, command palette, compact secondary links | Route-specific permissions | Navigation config | Sidebar/command tests | Preserved/moved | Removed duplicate large nav grid |
| Guided actions | `/dashboard/guided` and command palette | Existing guided route access | Feature flag route | Existing guided tests | Preserved/moved | Not permanent dashboard content |
| Activity awareness | Recent Activity section | Tenant activity access | `/activity/recent?limit=6` | Dashboard layout tests | Added using existing data | Fulfils audit/activity requirement |
| Location scope | Header selector when multiple locations | Existing `/me/location` context | `/me/location` | Multi-location tests | Preserved | Writes through same context endpoint |
| Partial data retry | Section-level retry for activity and stale-summary notice | Authenticated user | `ApiError.requestId` | Manual/visual review | Preserved/improved | Rest of dashboard stays usable |
| Loading state | Skeleton snapshot blocks | Authenticated user | Pending summary request | Dashboard layout tests | Preserved/improved | Avoids blocking spinner |
| Business/setup explanatory copy | Removed from permanent dashboard | Not applicable | Static copy | Simplicity tests | Removed | Duplicate or instructional, not functionality |
| “Full work path” checklist | Canonical setup/guided pages | `settings.manage` where relevant | `/setup/checklist` | Setup wizard tests | Removed from dashboard | Duplicate workflow education |
| “Finish setup later” card | Launch Control / Settings | `settings.manage` | Static route | Settings tests | Removed from dashboard | Setup is not daily dashboard content |

No capability is marked removed unless it was static instructional copy or duplicate navigation.
