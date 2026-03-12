DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocationKind') THEN
    CREATE TYPE "LocationKind" AS ENUM ('BRANCH', 'WAREHOUSE', 'SERVICE_REGION', 'FRANCHISE');
  END IF;
END
$$;

ALTER TABLE "Location"
ADD COLUMN "code" TEXT,
ADD COLUMN "kind" "LocationKind" NOT NULL DEFAULT 'BRANCH',
ADD COLUMN "email" TEXT,
ADD COLUMN "metadataJson" JSONB;

ALTER TABLE "Customer"
ADD COLUMN "homeLocationId" TEXT;

ALTER TABLE "ServicePlan"
ADD COLUMN "locationId" TEXT;

ALTER TABLE "InventoryLocation"
ADD COLUMN "businessLocationId" TEXT;

CREATE TABLE "LocationMembership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "roleOverride" "UserRole",
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocationMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_companyId_code_key" ON "Location"("companyId", "code");
CREATE INDEX "Location_companyId_kind_isActive_idx" ON "Location"("companyId", "kind", "isActive");
CREATE INDEX "Customer_companyId_homeLocationId_createdAt_idx" ON "Customer"("companyId", "homeLocationId", "createdAt");
CREATE INDEX "ServicePlan_tenantId_locationId_status_nextRunAt_idx" ON "ServicePlan"("tenantId", "locationId", "status", "nextRunAt");
CREATE INDEX "InventoryLocation_tenantId_businessLocationId_active_idx" ON "InventoryLocation"("tenantId", "businessLocationId", "active");
CREATE UNIQUE INDEX "LocationMembership_tenantId_userId_locationId_key" ON "LocationMembership"("tenantId", "userId", "locationId");
CREATE INDEX "LocationMembership_tenantId_userId_active_idx" ON "LocationMembership"("tenantId", "userId", "active");
CREATE INDEX "LocationMembership_tenantId_locationId_active_idx" ON "LocationMembership"("tenantId", "locationId", "active");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_homeLocationId_fkey" FOREIGN KEY ("homeLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServicePlan"
ADD CONSTRAINT "ServicePlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryLocation"
ADD CONSTRAINT "InventoryLocation_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LocationMembership"
ADD CONSTRAINT "LocationMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LocationMembership"
ADD CONSTRAINT "LocationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LocationMembership"
ADD CONSTRAINT "LocationMembership_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
