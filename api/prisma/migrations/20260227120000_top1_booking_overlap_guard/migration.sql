-- Enforce: no overlapping bookings per tenant + assigned user (only when assignedUserId IS NOT NULL).
-- Booking uses timestamp WITHOUT time zone => use tsrange().
-- Requires btree_gist so = on text columns works in GiST EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_no_overlap_company_technician'
  ) THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT booking_no_overlap_company_technician
      EXCLUDE USING gist (
        "companyId" WITH =,
        "assignedUserId" WITH =,
        tsrange("startsAt", "endsAt", '[)' ) WITH &&
      )
      WHERE ("assignedUserId" IS NOT NULL);
  END IF;
END;
$$;
