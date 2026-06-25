MyTitan Booking Phase 1I Audit
==============================

Current State
-------------

- Booking Pro services are tenant-owned `Service` records.
- Bookings keep `proServiceId` for the primary service and `pricingSnapshotJson` for historical price truth.
- Public booking remains a single-service flow by default.
- Booking conversion already carries booking pricing into job `formData`.
- Customer ETA/journey data is job-scoped and is not used for booking bundle pricing.

Conflict Points
---------------

- A multi-service bundle cannot replace `Booking.proServiceId` without breaking existing public booking and conversion paths.
- Recomputing historical booking totals from mutable service catalogue rows would rewrite price truth.
- Job line-item continuity must be derived from booking snapshots, not current catalogue prices.

Safest Additive Model
---------------------

- Add `BookingServiceLine` rows keyed by `companyId` and `bookingId`.
- Keep `Booking.proServiceId` as the primary service for compatibility.
- Store service name, duration, quantity, line total, and price snapshot on each line.
- Preserve aggregate bundle values in `pricingSnapshotJson` for continuity.

Rollback Strategy
-----------------

- Hide the dashboard bundle UI and continue using `Booking.proServiceId`.
- Existing service-line rows can remain inert; they are additive and cascade with bookings.
- Public booking remains single-service, so customer-facing rollback does not need URL or token changes.

Tenant And Billing Safety
-------------------------

- Service lines resolve only against services in the current `companyId`.
- Stripe and MyTitan billing are not touched.
- Customer payment state remains manual/provider-truthful and does not enable MyTitan Stripe for customer money.
