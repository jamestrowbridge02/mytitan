# MyTitan Phase 3 Workflow Audit

Date: 2026-06-04

## Scope

This audit covered the operator dashboard, customers, bookings, calendar, jobs, Live Work, inventory, finance, reports, integrations, settings, customer portal, and technician surfaces. The Phase 3 goal is not another readiness layer; it is workflow clarity. Every important surface should answer: what should I do next?

## Current Strengths

- Dashboard, Live Work, customer detail, and notification surfaces already use workflow-first language and action tiles.
- Booking auto-confirm exists as a real tenant setting and public bookings already preserve service, status, ETA, payment messaging, and conversion continuity.
- Customer detail already acts as a single timeline with bookings, jobs, commercial pressure, portal access, notes, and communication actions.
- Platform-only diagnostics and tenant business operations are already separated by route and role in the Phase 2 baseline.
- Calendar has day, week, and month modes, technician lanes, location filters, conflict visibility, and vertical page scrolling.

## Friction Found

- Booking status data was mostly readable, but the top of the booking page still required operators to infer the next workflow from counts.
- Booking settings had auto-confirm, but did not expose the broader business choice between auto-create job, auto-assign, manual review, and location-first scheduling.
- Calendar quick actions focused on navigation controls, while the best next paths were bookings, scheduling capacity, and workflow settings.
- Informational readiness/status blocks were sometimes descriptive before they were actionable.
- Some older module names remain for route stability, even though the product language is moving toward Get Customers, Book Work, Complete Work, Get Paid, and Grow Business.

## Safe Changes Made

- Added booking workflow controls for:
  - auto-create job after confirmation
  - auto-assign using location and service rules
  - manual review mode
  - location-first scheduling
- Stored those controls tenant-side in `businessConfigJson.bookingWorkflow` without changing Stripe, payment, or external integration behavior.
- Added a booking click-to-action rail that opens the conversion queue, calendar, or booking workflow settings directly.
- Added a calendar click-to-action rail for today&apos;s booking queue, scheduling capacity, and booking workflow rules.
- Preserved the existing public booking auto-confirm behavior and did not introduce unsafe implicit job creation.

## Conflicts And Risk Controls

- Auto-create and auto-assign are now configurable workflow choices, but automatic mutation should only execute when service, location, technician, and conversion rules are complete and test-covered.
- Location-first scheduling remains the default operator workflow stance; technician-specific booking is still available where existing service/staff assignment requires it.
- Click-to-action cards use existing routes and filters instead of new route creation.
- External monitoring remains intentionally deferred and must stay platform-admin-only.

## Rollback Strategy

- Revert the booking workflow UI controls and the `businessConfigJson.bookingWorkflow` read/write helpers.
- Existing auto-confirm, public booking tokens, booking conversion, calendar, and customer timeline flows continue to work without the new workflow object because defaults are defensive.
- No migrations, Stripe changes, provider credentials, or external mutations were introduced.

## Next Recommended Depth

- Wire auto-create job only after the booking conversion service can prove idempotency, assignment readiness, and audit coverage for every path.
- Add route-level query handling for booking filters so every deep link can open the exact queue state.
- Continue replacing passive dashboard metrics with direct entity queues.
