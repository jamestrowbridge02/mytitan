ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "customerJourneyStage" TEXT,
  ADD COLUMN IF NOT EXISTS "customerFacingStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "customerFacingStatusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customerEtaWindowStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customerEtaWindowEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customerEtaDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "customerEtaConfidence" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEtaStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEtaNote" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEtaUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customerEtaUpdatedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerTechnicianNameVisible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Job_companyId_customerEtaStatus_customerEtaUpdatedAt_idx"
  ON "Job"("companyId", "customerEtaStatus", "customerEtaUpdatedAt");
