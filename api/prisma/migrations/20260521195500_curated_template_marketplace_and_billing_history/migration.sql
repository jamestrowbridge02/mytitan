ALTER TABLE "JobSheetTemplate"
ADD COLUMN "metadataJson" JSONB;

CREATE TABLE "JobSheetTemplateHistory" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "notes" TEXT,
  "metadataJson" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobSheetTemplateHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobSheetTemplateHistory_templateId_createdAt_idx" ON "JobSheetTemplateHistory"("templateId", "createdAt");

ALTER TABLE "BillingCatalogOverride"
ADD COLUMN "changeNotes" TEXT;

CREATE TABLE "BillingCatalogOverrideHistory" (
  "id" TEXT NOT NULL,
  "overrideKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "interval" TEXT,
  "action" TEXT NOT NULL,
  "changeNotes" TEXT,
  "previousValuesJson" JSONB,
  "nextValuesJson" JSONB,
  "metadataJson" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingCatalogOverrideHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingCatalogOverrideHistory_overrideKey_createdAt_idx" ON "BillingCatalogOverrideHistory"("overrideKey", "createdAt");
CREATE INDEX "BillingCatalogOverrideHistory_kind_code_createdAt_idx" ON "BillingCatalogOverrideHistory"("kind", "code", "createdAt");
