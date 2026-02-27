ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "primaryTrade" TEXT;

CREATE INDEX IF NOT EXISTS "TenantSetting_primaryTrade_idx"
  ON "TenantSetting"("primaryTrade");
