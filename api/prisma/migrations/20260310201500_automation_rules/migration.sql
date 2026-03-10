CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "conditionJson" JSONB,
    "actionJson" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_tenantId_trigger_enabled_idx" ON "AutomationRule"("tenantId", "trigger", "enabled");
CREATE INDEX "AutomationRule_tenantId_createdAt_idx" ON "AutomationRule"("tenantId", "createdAt");

ALTER TABLE "AutomationRule"
ADD CONSTRAINT "AutomationRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
