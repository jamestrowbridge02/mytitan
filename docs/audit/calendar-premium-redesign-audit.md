# Calendar Premium Redesign Audit

## Scope

Route: `/dashboard/calendar`

This audit covers the existing tenant Calendar page only. No Calendar V2 route was introduced.

## Classification

| Existing item | Classification | New placement | Status |
| --- | --- | --- | --- |
| Calendar title | Core calendar control | Compact header | Preserved |
| Create/open booking access | Primary scheduling action | Header primary action and Booking queue shortcut | Preserved |
| Today / previous / next | Date/navigation control | Compact toolbar | Preserved |
| Day / week / month | View selector | Segmented toolbar | Preserved |
| Bookings lens | View/lens selector | Lens row | Preserved |
| Team rota lens | View/lens selector | Lens row using configured workforce term | Preserved |
| Availability lens | View/lens selector | Lens row | Preserved |
| Capacity lens | Scheduling state | Lens row and snapshot | Preserved |
| Assets lens | View/lens selector | Lens row and Manage menu | Preserved |
| Fleet lens | View/lens selector | Lens row | Preserved |
| Live map readiness | Technical/provider readiness detail | Lens row with setup state and Manage menu | Preserved, collapsed |
| Location selector | Scope selector | Compact scope row | Preserved |
| Workforce selector | Scope selector | Compact scope row | Preserved |
| Status saved views | Filter | Main calendar surface | Preserved |
| Search | Filter | Main calendar surface, placeholder simplified | Preserved |
| Active filters/reset | Filter | Active chips, reset only when filters active | Preserved |
| Location workload cards | Scheduling state | Main calendar surface | Preserved |
| Missing cover / conflicts / over-capacity | Actionable warning | One warnings summary | Preserved, consolidated |
| Booking table | Scheduling state | Main calendar surface | Preserved |
| Empty state | Empty-state copy | Concise empty state | Preserved, simplified |
| Time grid / month grid | Core calendar control | Main calendar/timeline | Preserved |
| Drag/drop, confirmation, undo | Core scheduling action | Main calendar/timeline | Preserved |
| Suggested slots | Core scheduling action | Booking cards | Preserved |

## Removed Or Collapsed Copy

Verbose explanatory paragraphs about location-based booking, provider-neutral directions, asset foundations, and generic actionable warning education were removed from permanent page chrome. Capability remains available through controls, warnings, booking records, and the Manage menu.

## Result

The Calendar now presents compact scheduling controls, lenses, scope selectors, snapshot metrics, one warning summary, focused search/filter controls, and the existing authoritative calendar/timeline.
