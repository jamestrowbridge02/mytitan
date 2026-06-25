ALTER TABLE "TenantSetting"
ADD COLUMN "activeJobSheetTemplateId" TEXT,
ADD COLUMN "activeJobSheetTemplateName" TEXT,
ADD COLUMN "activeJobSheetTemplateTrade" TEXT,
ADD COLUMN "activeJobSheetTemplateVersion" INTEGER;

CREATE TABLE "JobSheetTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeCategory" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" JSONB NOT NULL,
    "submittedByTenantId" TEXT,
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvalNotes" TEXT,
    "reviewNotes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSheetTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobSheetTemplate_key_key" ON "JobSheetTemplate"("key");
CREATE INDEX "JobSheetTemplate_tradeCategory_status_idx" ON "JobSheetTemplate"("tradeCategory", "status");
CREATE INDEX "JobSheetTemplate_status_isPublished_isArchived_idx" ON "JobSheetTemplate"("status", "isPublished", "isArchived");
CREATE INDEX "JobSheetTemplate_submittedByTenantId_status_idx" ON "JobSheetTemplate"("submittedByTenantId", "status");
CREATE INDEX "JobSheetTemplate_updatedAt_idx" ON "JobSheetTemplate"("updatedAt");

CREATE TABLE "BillingCatalogOverride" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "interval" TEXT,
    "lookupKey" TEXT,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "expectedAmountCents" INTEGER,
    "currency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationStatus" TEXT,
    "verificationMessage" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCatalogOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCatalogOverride_key_key" ON "BillingCatalogOverride"("key");
CREATE INDEX "BillingCatalogOverride_kind_code_idx" ON "BillingCatalogOverride"("kind", "code");
CREATE INDEX "BillingCatalogOverride_kind_code_interval_idx" ON "BillingCatalogOverride"("kind", "code", "interval");
CREATE INDEX "BillingCatalogOverride_state_active_idx" ON "BillingCatalogOverride"("state", "active");
CREATE INDEX "BillingCatalogOverride_updatedAt_idx" ON "BillingCatalogOverride"("updatedAt");
