# Customers Functionality Preservation Matrix

Date: 2026-07-12

| Previous capability | Previous location | New location | Permission/source | Status | Test coverage |
| --- | --- | --- | --- | --- | --- |
| Add customer/contact | Header action and empty state | Header primary action, empty state | `/trade-accounts` create permissions | Preserved | `dashboard-workflows.spec.ts` |
| Open customer | Row/customer title | Row title and primary action | `/customers` tenant data | Preserved | Existing customer row tests |
| Edit/review customer details | Row detail route | Customer detail route | Customer route guards | Preserved | Existing customer detail tests |
| Create linked job | Header/guidance/row overflow | Header secondary action and row overflow | Job create permission | Preserved | `dashboard-workflows.spec.ts` |
| Review bookings | Header/guidance/row overflow | Header secondary action and row overflow | Bookings route guards | Preserved | `dashboard-workflows.spec.ts` |
| View timeline/activity | Row primary/overflow | Row primary/overflow | Activity APIs | Preserved | Existing customer workflow tests |
| Send SMS/email | Row overflow | Row overflow | Communications API/RBAC | Preserved | Existing row action coverage |
| Log SMS/email/portal view | Row overflow | Row overflow | `/activity/events` tenant activity | Preserved | Existing row action coverage |
| Copy contact data | Row overflow and bulk bar | Row overflow and bulk bar | Browser clipboard | Preserved | Existing bulk/action coverage |
| Bulk select/copy | Queue table | Queue table | Client selection only | Preserved | Existing bulk coverage |
| Custom fields | Row overflow/context card | Row overflow/context card | Custom fields API/RBAC | Preserved | Existing custom field tests |
| All customers view | Saved view tabs | Shared readable tab | `/customers` | Preserved | Shared tab contrast test |
| Ready for work view | Saved view tabs | Shared readable tab and metric card | Derived from contact/job counts | Preserved | Shared tab contrast test |
| Needs follow-up view | Saved view tabs | Shared readable tab and metric card | Derived from job/activity counts | Preserved and corrected | Shared tab contrast test |
| Missing contact view | Saved view tabs | Missing details tab and metric card | Derived from email/phone presence | Preserved/renamed | Shared tab contrast test |
| Recent activity view | Saved view tab | Activity filter | Derived from activity count | Moved | `dashboard-workflows.spec.ts` |
| Search | Filter bar | Filter bar | Client filter over tenant-scoped rows | Preserved | Mobile shell and customer tests |
| Contact filter | Filter bar | Filter bar | Client filter over tenant-scoped rows | Preserved | Existing route coverage |
| Activity filter | Filter bar | Filter bar | Client filter over tenant-scoped rows | Preserved | Existing route coverage |
| Reset filters | Always visible | Only visible when active | Client state | Preserved with less clutter | Shared customer tests |
| Empty state actions | Empty-state card | Concise empty state | Header/route actions | Preserved | Shared customer tests |

No valuable Customers capability was removed. Explanatory cards were removed because their actions remain in the header, row overflow, filters or canonical routes.
