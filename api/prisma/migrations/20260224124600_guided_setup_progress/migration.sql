-- Guided setup progress persistence
ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "guidedSetupCurrentStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "guidedSetupCompletedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "guidedSetupSkippedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "TenantSetting_guidedSetupCompletedAt_idx"
  ON "TenantSetting"("guidedSetupCompletedAt");
