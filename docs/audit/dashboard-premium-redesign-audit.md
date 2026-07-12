# Dashboard Premium Redesign Audit

Date: 2026-07-12  
Route: `/dashboard`  
Implementation audited: `app/pages/dashboard/index.tsx`, `app/components/dashboard-shell.tsx`, `app/pages/dashboard/work.tsx`, dashboard E2E coverage, and existing API consumers.

## Current Data Sources

| Source | Purpose | Permission behavior |
| --- | --- | --- |
| `/command-centre/summary` | Bookings today, due and overdue jobs, unpaid jobs, drafts, quick actions, money summary | Tenant-scoped authenticated dashboard source |
| `/me` | Signed-in user, workspace role, permission snapshot | Authenticated principal |
| `/setup/checklist` | Setup and first-value progress | Filtered in UI by route permission |
| `/me/location` | Active location selector and available locations | Authenticated user context |
| `/activity/recent?limit=6` | Recent operational activity | Tenant activity feed; no sensitive audit metadata shown |
| Dashboard shell `/notifications` | Bell count, drawer, mark read/dismiss | Existing shell behavior; not duplicated in the page |

## Responsive And Loading Behavior

The previous dashboard used one full-page load path for the command-centre summary and only lazy-degraded setup checklist and `/me`. The redesigned page keeps the command-centre summary as the primary source, loads activity independently, and shows scoped skeleton blocks so the shell remains usable. Recent Activity has its own retry and request ID handling.

The prior mobile experience stacked many instructional cards under an open details panel. The new structure stacks the six required areas in order: header, snapshot, priority, schedule, live work, recent activity. Snapshot cards render four across on desktop, two across on tablet/mobile.

## Item Classification

| Existing item | Classification | New placement | Reason |
| --- | --- | --- | --- |
| Hero title “Keep work moving from the first job sheet to payment” | Explanatory copy | Removed | Replaced by concise greeting and business/date metadata |
| “Strongest next move” card | Primary contextual action | Today’s priority | Preserved as one deterministic priority only |
| Hero primary actions: Open job sheet, Continue draft, Finish and send, Get paid, See live work | Primary contextual action / operational queue | Primary header action, Today’s priority, Live work rows, secondary links | Removed duplicated recommendations while keeping direct paths |
| Setup progress details | Setup/owner-only information | Launch Control / Settings links | Canonical setup pages own setup state |
| Business momentum KPI grid | Essential daily information | Business snapshot | Preserved, capped at four cards |
| Duplicate KPI grid during loading | Duplicate information | Skeleton cards | Prevents duplicate metric presentation |
| Today’s operating picture | Operational queue / explanatory copy | Business snapshot and Live work counters | Counts preserved without long guidance |
| What needs attention | Primary contextual action | Today’s priority | Merged into single dominant priority |
| Open the rest of the workspace | Secondary navigation | Compact secondary links | Preserved without permanent large card |
| Owner setup | Setup/owner-only information | Launch Control / Settings / Billing links | Moved to canonical pages |
| Setup journey | Setup/owner-only information / duplicate information | Today’s priority only when setup is the strongest permitted action | Stops repeating checklist |
| Full work path | Explanatory copy / secondary navigation | Existing global navigation and guided/setup pages | Removed from permanent dashboard |
| Useful areas | Secondary navigation | Existing shell navigation and compact secondary links | Removed as duplicate navigation |
| Guided actions | Secondary navigation | Existing `/dashboard/guided` and command palette | Not permanently displayed |
| Today’s schedule bookings | Schedule | Today’s schedule | Preserved and promoted |
| Jobs due or overdue | Operational queue | Live work and Today’s priority | Preserved as live jobs, ready to send, and priority |
| Commercial follow-up | Operational queue / finance | Business snapshot when permitted, Live work awaiting payment, Billing link | Preserved and permission-aware |
| Pick up where you left off | Operational queue | Live work drafts | Preserved |
| Finish setup later | Setup/owner-only information | Launch Control / Settings | Removed from normal operational page |
| Notification drawer/count | Alerts | Shell bell plus compact drawer | Preserved in `DashboardShell`; not duplicated on page |

## Dashboard Action Records

| Current label | Route/action | Permission | Data source | New destination or placement | Visibility | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Open job sheet | `/dashboard/work` | Authenticated dashboard access | Static route / command-centre enabled | Replaced by `Create job` or role-specific primary action | Contextual | Starting from a new job is the clearest default; Live Work remains linked |
| Create job | `/dashboard/jobs/new`, `/dashboard/jobs/new?guided=1&entry=dashboard` | Authenticated job route access | Static route | Header primary action | Always visible when permitted | Required dominant action |
| Continue draft | `/dashboard/jobs/new?guided=1&resumeTrade=...&entry=work` | Draft owner and job route access | `/command-centre/summary.drafts.jobs` | Today’s priority or Live work row | Contextual | Preserves draft continuation |
| Finish and send | `/dashboard/jobs/:id` | Job access / transition controls on record | `/command-centre/summary.dueAndOverdueJobs` | Today’s priority or Live work row | Contextual | Preserves completed-work handoff |
| Get paid | `/dashboard/jobs/:id`, `/dashboard/billing/readiness` | `billing.manage` for billing views | `/command-centre/summary.unpaidJobs` | Today’s priority or Awaiting payment tab | Contextual | Finance remains hidden from unauthorised users |
| See live work | `getCommandCentreHref(settings)` | Existing Live Work route permissions | Tenant settings and route config | Live work section link | Always visible in Live work | Canonical queue access |
| Open bookings | `/dashboard/bookings` | Authenticated booking route access | Quick action/static | Schedule empty-state / snapshot card | Contextual | Preserves booking access |
| New booking | `/dashboard/bookings` | Authenticated booking route access | `/command-centre/summary.quickActions` fallback | Schedule empty-state | Contextual | Create booking remains available from canonical page |
| New customer | `/dashboard/trade-accounts` | Authenticated customer/CRM route access | `/command-centre/summary.quickActions` fallback | Existing navigation / command palette | Moved | Not a daily dashboard primary action |
| Launch Control | `/dashboard/settings/launch-control` | `settings.manage` | Owner shortcut | Secondary link | Collapsed/moved | Canonical setup page |
| Billing and job packs | `/dashboard/billing?section=job-packs` | `billing.manage` | Owner shortcut | Billing secondary link | Moved | Canonical billing page |
| Booking settings | `/dashboard/settings?tab=bookings&section=booking-setup` | `settings.manage` | Owner shortcut | Settings secondary link | Moved | Canonical settings page |
| Business settings | `/dashboard/settings?section=guided-setup-hub` | `settings.manage` | Owner shortcut | Settings secondary link | Moved | Canonical settings page |
| Recommended next action | Checklist href | Route-specific permission filter | `/setup/checklist` | Today’s priority only when strongest permitted setup action | Contextual | Removes duplicate recommendations |
| Review setup step | Checklist href | Route-specific permission filter | `/setup/checklist` | Launch Control / Settings, or priority if strongest | Contextual/moved | Setup remains accessible without permanent dashboard checklist |
| Open analytics | `/dashboard/analytics` | `dashboard.view_intelligence` | Snapshot source link | Business snapshot heading link | Contextual | Preserves source drill-through |
| Open calendar | `/dashboard/calendar` | Existing calendar route permissions | Schedule source link | Today’s schedule heading link | Always visible | Preserves full schedule access |
| Review booking | `/dashboard/bookings/:id` or `/dashboard/bookings` | Existing booking route permissions | `/command-centre/summary.todayBookings` | Schedule row | Contextual | Links rows to exact record when ID exists |
| Review job | `/dashboard/jobs/:id` | Existing job route permissions | `/command-centre/summary.dueAndOverdueJobs` | Live work row | Contextual | Links records directly |
| Review billing | `/dashboard/billing` | `billing.manage` | `/command-centre/summary.money` | Billing secondary link / payment tab | Contextual | Finance data remains protected |
| Delete eligible draft | `/dashboard/work` draft delete controls | Draft owner and backend draft policy | Live Work `/drafts/:id` behavior | Live Work row links to canonical draft controls | Moved one click | Destructive action remains where confirmation and audit behavior already exist |
| Mark notifications read | Dashboard shell drawer action | Existing notification permissions | `/notifications/read-all` | Shell bell drawer | Contextual | Preserved without page duplication |
| Open unread notifications | `/dashboard/notifications?filter=unread` | Existing notification route access | `/notifications` | Shell bell and command palette | Contextual | Preserved |

No valuable dashboard capability was removed. Removed content was explanatory, duplicate, or setup/navigation content already owned by canonical pages.
