-- Guided Setup V2 fields
ALTER TABLE "TenantSetting" ADD COLUMN "guidedSetupCompletedAt" TIMESTAMP(3);
ALTER TABLE "TenantSetting" ADD COLUMN "supportPhone" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN "defaultTorqueSetting" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN "defaultTyrePressure" TEXT;

ALTER TABLE "ServiceCatalogItem" ADD COLUMN "key" TEXT;
ALTER TABLE "ServiceCatalogItem" ADD COLUMN "vatEligible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ServiceCatalogItem_tenantId_key_idx" ON "ServiceCatalogItem"("tenantId", "key");
CREATE UNIQUE INDEX "ServiceCatalogItem_tenantId_key_key" ON "ServiceCatalogItem"("tenantId", "key");
