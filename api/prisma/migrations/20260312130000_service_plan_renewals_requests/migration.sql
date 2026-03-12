-- CreateEnum
CREATE TYPE "ServicePlanRenewalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServicePlanChangeRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServicePlanChangeRequestKind" AS ENUM ('PAUSE_REQUEST', 'RESUME_REQUEST', 'CANCEL_REQUEST', 'CADENCE_CHANGE_REQUEST', 'SCOPE_CHANGE_REQUEST');

-- CreateEnum
CREATE TYPE "ServicePlanRequestActor" AS ENUM ('CUSTOMER', 'OPERATOR');

-- CreateTable
CREATE TABLE "ServicePlanRenewal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ServicePlanRenewalStatus" NOT NULL DEFAULT 'PENDING',
    "renewalWindowStartAt" TIMESTAMP(3) NOT NULL,
    "renewalWindowEndAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlanRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlanChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ServicePlanChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "kind" "ServicePlanChangeRequestKind" NOT NULL,
    "requestedBy" "ServicePlanRequestActor" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePlanChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePlanRenewal_tenantId_status_renewalWindowStartAt_idx" ON "ServicePlanRenewal"("tenantId", "status", "renewalWindowStartAt");

-- CreateIndex
CREATE INDEX "ServicePlanRenewal_tenantId_customerId_status_idx" ON "ServicePlanRenewal"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "ServicePlanRenewal_tenantId_planId_createdAt_idx" ON "ServicePlanRenewal"("tenantId", "planId", "createdAt");

-- CreateIndex
CREATE INDEX "ServicePlanChangeRequest_tenantId_status_requestedAt_idx" ON "ServicePlanChangeRequest"("tenantId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "ServicePlanChangeRequest_tenantId_customerId_status_idx" ON "ServicePlanChangeRequest"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "ServicePlanChangeRequest_tenantId_planId_kind_idx" ON "ServicePlanChangeRequest"("tenantId", "planId", "kind");

-- AddForeignKey
ALTER TABLE "ServicePlanRenewal" ADD CONSTRAINT "ServicePlanRenewal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanRenewal" ADD CONSTRAINT "ServicePlanRenewal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanRenewal" ADD CONSTRAINT "ServicePlanRenewal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanChangeRequest" ADD CONSTRAINT "ServicePlanChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanChangeRequest" ADD CONSTRAINT "ServicePlanChangeRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanChangeRequest" ADD CONSTRAINT "ServicePlanChangeRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
