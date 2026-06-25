CREATE TABLE "EnterpriseFeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "tenantId" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'all',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
  "overrideSource" TEXT NOT NULL DEFAULT 'platform',
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnterpriseFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseFeatureFlag_key_tenantId_environment_key"
  ON "EnterpriseFeatureFlag"("key", "tenantId", "environment");

CREATE INDEX "EnterpriseFeatureFlag_tenantId_key_idx"
  ON "EnterpriseFeatureFlag"("tenantId", "key");

CREATE INDEX "EnterpriseFeatureFlag_key_environment_idx"
  ON "EnterpriseFeatureFlag"("key", "environment");

CREATE INDEX "EnterpriseFeatureFlag_updatedAt_idx"
  ON "EnterpriseFeatureFlag"("updatedAt");

ALTER TABLE "EnterpriseFeatureFlag"
  ADD CONSTRAINT "EnterpriseFeatureFlag_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

