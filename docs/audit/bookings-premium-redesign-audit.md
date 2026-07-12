# Bookings Premium Redesign Audit

## Previous Surface

The Bookings page combined operational queue work with always-visible setup and education:

- repeated scheduling/bookings headings
- a permanently expanded manual booking form
- public booking setup copy
- raw share URL display
- workflow guidance rail
- repeated reset/settings actions
- long conversion and queue explanations

## New Information Architecture

1. Compact page header
2. Operational snapshot
3. Booking queue
4. Contextual creation panel
5. Compact public booking status
6. Secondary settings/actions

## Preserved Actions

- Create booking: moved from permanently expanded form to `Create booking` panel.
- Add service: preserved inside the creation panel.
- Booking queue search/status/timing filters: preserved.
- Reset filters: shown only when filters are active.
- Convert to job: preserved in row primary/overflow actions.
- Open linked job: preserved in row actions.
- Schedule/open calendar: preserved through header and row action.
- Copy booking ID/customer IDs: preserved in row and bulk actions.
- Custom fields: preserved in row overflow.
- Public booking preview/copy/manage: preserved in compact public booking card.
- ICS copy: preserved when available.
- Email/notification settings: preserved as `Notifications`.

## Removed Or Collapsed Copy

Instructional text about moving demand into work, operational work staying on the page, and multiple zero-state explanations was removed or collapsed into labels/actions. No authoritative booking logic moved to the frontend.

## Tests

- Dashboard workflow tests open the creation panel before creating bookings.
- Booking settings persistence tests verify settings are handed off without duplicating controls.
- Mobile shell tests verify the compact search placeholder.
