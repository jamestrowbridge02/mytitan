CREATE TYPE "AssetOperationalStatus" AS ENUM ('AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE_DUE', 'OUT_OF_SERVICE');
CREATE TYPE "FinancialApprovalKind" AS ENUM ('DISCOUNT', 'PARTS_ADJUSTMENT', 'QUOTE', 'VARIATION', 'REFUND', 'CREDIT');
CREATE TYPE "FinancialApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "equipmentType" TEXT NOT NULL,
  "serialNumber" TEXT,
  "locationId" TEXT,
  "assignedOperatorId" TEXT,
  "assignedJobId" TEXT,
  "status" "AssetOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
  "maintenanceDueAt" TIMESTAMP(3),
  "lastInspectionAt" TIMESTAMP(3),
  "inspectionHistory" JSONB,
  "requiredForTemplate" TEXT,
  "checkedOutAt" TIMESTAMP(3),
  "checkedInAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialApprovalPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "FinancialApprovalKind" NOT NULL,
  "role" TEXT,
  "locationId" TEXT,
  "limitCents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialApprovalPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialApprovalRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "FinancialApprovalKind" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "locationId" TEXT,
  "jobId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "reason" TEXT,
  "status" "FinancialApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "customerApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleLookupAudit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "registration" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "safeCategory" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "responseJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleLookupAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_tenantId_serialNumber_key" ON "Asset"("tenantId", "serialNumber");
CREATE INDEX "Asset_tenantId_status_locationId_idx" ON "Asset"("tenantId", "status", "locationId");
CREATE INDEX "Asset_tenantId_assignedOperatorId_assignedJobId_idx" ON "Asset"("tenantId", "assignedOperatorId", "assignedJobId");
CREATE UNIQUE INDEX "FinancialApprovalPolicy_tenantId_kind_role_locationId_key" ON "FinancialApprovalPolicy"("tenantId", "kind", "role", "locationId");
CREATE INDEX "FinancialApprovalPolicy_tenantId_active_kind_idx" ON "FinancialApprovalPolicy"("tenantId", "active", "kind");
CREATE INDEX "FinancialApprovalRequest_tenantId_status_createdAt_idx" ON "FinancialApprovalRequest"("tenantId", "status", "createdAt");
CREATE INDEX "FinancialApprovalRequest_tenantId_jobId_idx" ON "FinancialApprovalRequest"("tenantId", "jobId");
CREATE INDEX "VehicleLookupAudit_tenantId_registration_createdAt_idx" ON "VehicleLookupAudit"("tenantId", "registration", "createdAt");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialApprovalPolicy" ADD CONSTRAINT "FinancialApprovalPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialApprovalRequest" ADD CONSTRAINT "FinancialApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleLookupAudit" ADD CONSTRAINT "VehicleLookupAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
