-- Top-1% broader pass: enforce no overlapping bookings per tenant+technician (Postgres).
-- Requires btree_gist for equality operators in GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_no_overlap_company_technician'
  ) THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT booking_no_overlap_company_technician
      EXCLUDE USING gist (
        "companyId" WITH =,
        "assignedUserId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS booking_company_tech_time_idx
  ON booking ("companyId", "assignedUserId", "startsAt", "endsAt");

CREATE INDEX IF NOT EXISTS booking_company_startsat_idx
  ON booking ("companyId", "startsAt");
