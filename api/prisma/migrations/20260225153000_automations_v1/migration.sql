-- Automations V1 settings

CREATE TABLE IF NOT EXISTS "AutomationsSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "configJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationsSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationsSetting_tenantId_key" ON "AutomationsSetting"("tenantId");
CREATE INDEX IF NOT EXISTS "AutomationsSetting_updatedAt_idx" ON "AutomationsSetting"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "AutomationsSetting"
  ADD CONSTRAINT "AutomationsSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
