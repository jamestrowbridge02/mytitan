-- Locations V1 + job command centre support fields

ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "defaultLocationId" TEXT;

ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "defaultLocationId" TEXT;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "pricingNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing jobs with the first active location for that company
UPDATE "Job" j
SET "locationId" = q."id"
FROM (
  SELECT DISTINCT ON (l."companyId") l."companyId", l."id"
  FROM "Location" l
  WHERE COALESCE(l."isActive", true) = true
  ORDER BY l."companyId", l."createdAt" ASC
) q
WHERE j."companyId" = q."companyId"
  AND j."locationId" IS NULL;

CREATE INDEX IF NOT EXISTS "Location_companyId_isActive_idx" ON "Location"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "Job_companyId_status_createdAt_idx" ON "Job"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_locationId_status_createdAt_idx" ON "Job"("companyId", "locationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "User_defaultLocationId_idx" ON "User"("defaultLocationId");
CREATE INDEX IF NOT EXISTS "TenantSetting_defaultLocationId_idx" ON "TenantSetting"("defaultLocationId");
CREATE INDEX IF NOT EXISTS "Job_assignedUserId_idx" ON "Job"("assignedUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_defaultLocationId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_defaultLocationId_fkey"
      FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantSetting_defaultLocationId_fkey'
  ) THEN
    ALTER TABLE "TenantSetting"
      ADD CONSTRAINT "TenantSetting_defaultLocationId_fkey"
      FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Job_assignedUserId_fkey'
  ) THEN
    ALTER TABLE "Job"
      ADD CONSTRAINT "Job_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
