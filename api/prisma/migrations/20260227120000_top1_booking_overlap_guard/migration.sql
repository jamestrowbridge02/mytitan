-- Top-1% broader pass: enforce no overlapping bookings per tenant + assigned user (Postgres).
-- Uses a STORED generated range column so the GiST exclusion uses only IMMUTABLE inputs.
-- Requires btree_gist so '=' on text columns can be used in a GiST EXCLUDE constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add a stored range column for overlap checks
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "timeRange" tstzrange
  GENERATED ALWAYS AS (tstzrange("startsAt", "endsAt", '[)')) STORED;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS "booking_company_assigned_time_gist_idx"
  ON "Booking"
  USING gist ("companyId", "assignedUserId", "timeRange");

CREATE INDEX IF NOT EXISTS "booking_company_startsat_idx"
  ON "Booking" ("companyId", "startsAt");

-- Add the exclusion constraint once.
-- Exclude only rows where assignedUserId is NOT NULL so unassigned bookings don't collide.
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
        "timeRange" WITH &&
      )
      WHERE ("assignedUserId" IS NOT NULL);
  END IF;
END;
$$;
