# Shared Control Contrast Root Cause

Date: 2026-07-12

## Root Cause

Calendar, Bookings and Customers reused the operator saved-view tab pattern. Older CSS for `.operator-viewTabs__item` used translucent dark surfaces and inherited muted foreground colors. Later page redesigns introduced lighter cards and dark-blue surfaces, but selected labels and counters did not have explicit state-specific foreground/background tokens. The result was low-contrast text in selected tabs, counters, metric chips and dark surfaces.

## Shared Fix

The late launch contrast layer now defines explicit semantic tokens for:

- page title and subtitle text
- selected and unselected tab surfaces
- selected and unselected tab labels
- tab counter surfaces and text
- metric surface/text/value
- dark-card surface/text/muted text
- focus and border colors

`.operator-viewTabs__item` and `.operator-viewTabs__count` now use those tokens for unselected, selected, hover and focus states. Counters no longer inherit an unreadable parent color by accident.

## Affected Routes

| Route | Affected element | Correction |
| --- | --- | --- |
| Dashboard | Greeting/business/date | Uses page title/subtitle tokens with opacity removed |
| Calendar | All/Unassigned/Confirmed/In progress/Completed tabs and counters | Shared operator tab tokens |
| Bookings | All/Upcoming/Today/Needs conversion tabs and counters | Shared operator tab tokens |
| Bookings | Dark booking/public surfaces | Dark-card tokens available to page surfaces |
| Customers | All/Ready for work/Needs follow-up/Missing details tabs and counters | Shared operator tab tokens |
| Customers | Relationship metrics | Shared metric tokens with active selected state |

## Test Coverage

`dashboard-workflows.spec.ts` computes actual foreground/background contrast for shared tab labels and counts on Calendar, Bookings and Customers. It does not rely on token names alone.
