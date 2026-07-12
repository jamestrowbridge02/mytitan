# Navigation Functionality Preservation Matrix

Date: 2026-07-12

| Old sidebar item | Previous route | New location | Redirect/alias | Permission | Feature availability | Test coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Search | Command palette | Search | Same action | Result-level permissions | Always | `sidebar-navigation.spec.ts` |
| Dashboard | `/dashboard` | Dashboard | Same route | Authenticated | Dashboard enabled | Dashboard E2E |
| Work | `/dashboard/work` | Operations → Work | Same route | Work access | Work enabled | Sidebar + Live Work E2E |
| Assigned | `/dashboard/technician` | Work view/filter | Route retained | `technician.execute` | Technician queue | Technician sidebar tests |
| Live Work | `/dashboard/command-centre-v2` | Work view | Route retained | Work access | Command centre | Dashboard workflow tests |
| Jobs | `/dashboard/jobs` | Work records view | Route retained | Job route access | Jobs | Job E2E |
| Calendar | `/dashboard/calendar` | Operations → Calendar | Same route | Schedule/job permissions | Calendar | Calendar E2E |
| Bookings | `/dashboard/bookings` | Operations → Bookings | Same route | Booking access | Bookings | Booking E2E |
| Reports | `/dashboard/analytics` | Business → Reports | Same route | `dashboard.view_intelligence` | Intelligence | Sidebar tests |
| Compliance | `/dashboard/compliance` | Business → Compliance | Same route | `dashboard.view_intelligence` | Intelligence | Compliance E2E |
| Assets | `/dashboard/assets` | Operations → Assets | Same route | Route access | Asset module | Asset E2E |
| Customers | `/dashboard/customers` | Operations → Customers | Same route | Customer access | CRM | Customer E2E |
| Comms | `/dashboard/communications` | Communications → Communications | Same route | Route access | Communications | Sidebar tests |
| Customer page | `/dashboard/portal` | Communications → Customer Portal | Same route | `portal.manage` | Portal ops | Portal E2E |
| Plans | `/dashboard/service-plans` | Settings/recurring work context | Route retained | `settings.manage` | Service plans | Service plan E2E |
| Payments | `/dashboard/finance` | Finance → Finance | Same route | `billing.manage` | Finance | Finance sidebar tests |
| Payment Setup | `/dashboard/settings/payments` | Finance shortcut / Settings payments | Route retained | `settings.manage` | Payments setup | Payments E2E |
| Quotes | `/dashboard/quotes` | Sales → Quotes | Same route | `billing.manage` | Quotes | Revenue E2E |
| Revenue | `/dashboard/revenue` | Finance view | Route retained | `billing.manage` | Revenue | Revenue E2E |
| Billing | `/dashboard/billing` | MyTitan Account / Billing | Route retained | `billing.manage` | Billing | Billing E2E |
| Profile | Settings company profile | Settings → Business Profile | Same route | `settings.manage` | Settings | Settings E2E |
| Settings | `/dashboard/settings` | Settings → Settings | Same route | `settings.manage` | Settings | Settings E2E |
| Team | `/dashboard/users` | Business → Team | Same route | `users.invite` or `users.role_assign` | Users | Governance E2E |
| Tools | `/dashboard/integrations` | Settings → Tools | Same route | `settings.manage` | Integrations | Sidebar/Integrations E2E |
| Enterprise | `/dashboard/enterprise` | Platform Admin only in sidebar | Tenant route retained, sidebar hidden | `platformAdmin` for sidebar | Platform admin | Sidebar/platform tests |
| Sign out | Logout action | Account footer | Same action | Authenticated | Logout flag | Login/logout E2E |

