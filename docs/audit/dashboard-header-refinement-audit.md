# Dashboard Header Refinement Audit

## Scope

Route: `/dashboard`

The Dashboard already used the premium operational structure from the prior redesign. This pass focused only on the page header and the first metric row.

## Findings

| Item | Previous rendering | Result |
| --- | --- | --- |
| Shell title | Sidebar/shell identifies Dashboard through active navigation. | Preserved. |
| Page title | The page rendered a visible Dashboard kicker above the greeting. | Retained as a small kicker, with the greeting as the only H1. |
| Greeting | Greeting used the configured display-name resolution and was visually oversized. | Preserved data source; reduced scale and spacing. |
| Business/date | Rendered below greeting in low-emphasis muted styling. | Kept as one readable secondary line using semantic text tokens. |
| Location selector | Dashboard-owned selector remained in the header. | Preserved and aligned with the primary action. |
| Primary action | Permission-aware action, usually Create job. | Preserved. |
| Business snapshot label | Large visible heading repeated what the KPI cards already communicated. | Converted to a visually hidden accessible label. |
| Responsive behavior | Header stacked on mobile. | Preserved with reduced vertical footprint. |
| Light/dark contrast | Depended on muted tokens. | Uses central text-primary/text-secondary tokens. |

## Action Mapping

| Action | Current route/action | Permission/source | New placement | Status |
| --- | --- | --- | --- | --- |
| Create job | `/dashboard/jobs/new?guided=1&entry=dashboard` | Existing `jobs.create`-aware dashboard action selection | Compact header primary action | Preserved |
| Review approvals | `/dashboard/portal` | Existing portal permission fallback | Compact header primary action when job creation unavailable | Preserved |
| Open work | `/dashboard/technician` | Existing technician execution fallback | Compact header primary action when relevant | Preserved |
| Open bookings | `/dashboard/bookings` | Existing final fallback | Compact header primary action when relevant | Preserved |
| Location filter | Dashboard location context | Existing tenant location context | Compact header selector | Preserved |
| Open analytics | `/dashboard/analytics` | Existing navigation permission check on route | Snapshot row action | Preserved |

## Result

The Dashboard header is materially shorter, the greeting/business/date remain readable, the primary action and location selector remain available, and the redundant visible Business snapshot heading no longer competes with the KPI cards.
