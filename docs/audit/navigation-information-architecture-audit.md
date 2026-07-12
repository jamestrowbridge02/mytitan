# Navigation Information Architecture Audit

Date: 2026-07-12  
Scope: tenant-facing sidebar, command palette, mobile navigation, route compatibility, and Platform Admin separation.

## Root Cause

The previous sidebar exposed implementation history as navigation. Work appeared as separate top-level entries (`Work`, `Assigned`, `Live Work`, `Jobs`), finance appeared as separate commercial/payment entries (`Plans`, `Payments`, `Payment Setup`, `Revenue`, `Billing`), and customer records were split from the customer-facing portal using the unclear label `Customer page`.

The routes were mostly valid, but the top-level labels duplicated workflows instead of presenting a stable information architecture.

## Current Menu Entry Mapping

| Old label | Route | Module | Permission | Feature/plan gate | Canonical destination | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Search | Command palette | Global search | Route/search result permissions | None | Search | Retained |
| Dashboard | `/dashboard` | Home | Authenticated user | Command centre enabled | Dashboard | Retained |
| Work | `/dashboard/work` | Operations | Authenticated work access | Command centre/work routes | Work | Retained as canonical |
| Assigned | `/dashboard/technician` | Operations | `technician.execute` | Technician queue | Work filter/view | Grouped under Work |
| Live Work | `/dashboard/command-centre-v2` | Operations | Authenticated work access | Command centre version | Work view | Converted to Work view/link |
| Jobs | `/dashboard/jobs` | Operations | Job route access | None | Work records/view | Converted to Work view; direct record URLs retained |
| Calendar | `/dashboard/calendar` | Operations | Schedule/job transition/intelligence/technician access | Calendar flag where configured | Calendar | Retained |
| Bookings | `/dashboard/bookings` | Operations | Booking route access | Booking module | Bookings | Retained |
| Reports | `/dashboard/analytics` | Business | `dashboard.view_intelligence` | Intelligence visible | Reports | Retained |
| Compliance | `/dashboard/compliance` | Business | `dashboard.view_intelligence` | Intelligence visible | Compliance | Retained |
| Assets | `/dashboard/assets` | Operations | Route access | Asset module availability | Assets | Retained/adaptive |
| Customers | `/dashboard/customers` | Operations | Customer route access | CRM module | Customers | Retained |
| Comms | `/dashboard/communications` | Communications | Route access | Communications availability | Communications | Renamed |
| Customer page | `/dashboard/portal` | Communications | `portal.manage` | Portal ops visible | Customer Portal | Renamed |
| Plans | `/dashboard/service-plans` | Recurring work | `settings.manage` | Service plan feature | Settings / Work recurring context | Moved from top level |
| Payments | `/dashboard/finance` | Finance | `billing.manage` | Finance feature | Finance | Renamed/consolidated |
| Payment Setup | `/dashboard/settings/payments` | Finance setup | `settings.manage` | Payments setup | Finance shortcut / Settings payments | Moved from top level |
| Quotes | `/dashboard/quotes` | Sales | `billing.manage` | Quotes/revenue feature | Quotes | Retained |
| Revenue | `/dashboard/revenue` | Finance | `billing.manage` | Revenue feature | Finance view | Converted to Finance view |
| Billing | `/dashboard/billing` | MyTitan account billing | `billing.manage` | Billing feature | MyTitan Account / Billing | Removed from tenant finance top level |
| Profile | `/dashboard/settings?tab=general&section=company-profile-hub` | Settings | `settings.manage` | None | Business Profile | Renamed |
| Settings | `/dashboard/settings` | Settings | `settings.manage` | None | Settings | Retained |
| Team | `/dashboard/users` | Business | `users.invite` or `users.role_assign` | None | Team | Retained |
| Tools | `/dashboard/integrations` | Settings | `settings.manage` | Integrations | Tools | Retained |
| Enterprise | `/dashboard/enterprise` | Platform/enterprise readiness | Platform admin only for sidebar exposure | Platform admin | Platform Admin | Hidden for normal tenant users |
| Sign out | Button action | Account | Authenticated user | Logout flag | Account footer | Retained outside normal modules |

## Compatibility

No route was deleted. Existing deep links continue to load their existing pages. The sidebar and command palette now present canonical destinations while old URLs remain available for bookmarks, tests, support links, and direct record links.

