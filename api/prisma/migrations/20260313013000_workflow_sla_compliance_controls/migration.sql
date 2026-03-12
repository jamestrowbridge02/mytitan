-- CreateEnum
CREATE TYPE "WorkflowSlaEntityType" AS ENUM ('JOB', 'BOOKING', 'QUOTE', 'APPROVAL', 'SERVICE_PLAN');

-- CreateEnum
CREATE TYPE "WorkflowSlaSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkflowSlaEventStatus" AS ENUM ('OPEN', 'MET', 'BREACHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplianceExceptionKind" AS ENUM (
  'MISSING_REQUIRED_FIELD',
  'MISSING_EXECUTION_EVIDENCE',
  'MISSING_APPROVAL',
  'SLA_BREACH',
  'INVENTORY_SHORTAGE_BLOCK',
  'MANUAL_OVERRIDE'
);

-- CreateEnum
CREATE TYPE "ComplianceExceptionSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplianceExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "WorkflowSlaPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "entityType" "WorkflowSlaEntityType" NOT NULL,
  "triggerStatus" TEXT NOT NULL,
  "targetStatus" TEXT NOT NULL,
  "targetMinutes" INTEGER NOT NULL,
  "severity" "WorkflowSlaSeverity" NOT NULL DEFAULT 'WARNING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowSlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowSlaEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "entityType" "WorkflowSlaEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "locationId" TEXT,
  "assignedUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "breachedAt" TIMESTAMP(3),
  "status" "WorkflowSlaEventStatus" NOT NULL DEFAULT 'OPEN',
  "contextJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowSlaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceException" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" "WorkflowSlaEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "locationId" TEXT,
  "assignedUserId" TEXT,
  "kind" "ComplianceExceptionKind" NOT NULL,
  "severity" "ComplianceExceptionSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "ComplianceExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "detailsJson" JSONB,
  "createdBy" TEXT,
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplianceException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowSlaPolicy_tenantId_entityType_active_idx" ON "WorkflowSlaPolicy"("tenantId", "entityType", "active");

-- CreateIndex
CREATE INDEX "WorkflowSlaPolicy_tenantId_active_severity_idx" ON "WorkflowSlaPolicy"("tenantId", "active", "severity");

-- CreateIndex
CREATE INDEX "WorkflowSlaEvent_tenantId_entityType_entityId_status_idx" ON "WorkflowSlaEvent"("tenantId", "entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "WorkflowSlaEvent_tenantId_policyId_status_dueAt_idx" ON "WorkflowSlaEvent"("tenantId", "policyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkflowSlaEvent_tenantId_status_dueAt_idx" ON "WorkflowSlaEvent"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkflowSlaEvent_tenantId_locationId_status_dueAt_idx" ON "WorkflowSlaEvent"("tenantId", "locationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkflowSlaEvent_tenantId_assignedUserId_status_dueAt_idx" ON "WorkflowSlaEvent"("tenantId", "assignedUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ComplianceException_tenantId_entityType_entityId_status_idx" ON "ComplianceException"("tenantId", "entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "ComplianceException_tenantId_kind_status_createdAt_idx" ON "ComplianceException"("tenantId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceException_tenantId_severity_status_createdAt_idx" ON "ComplianceException"("tenantId", "severity", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceException_tenantId_locationId_status_createdAt_idx" ON "ComplianceException"("tenantId", "locationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceException_tenantId_assignedUserId_status_createdAt_idx" ON "ComplianceException"("tenantId", "assignedUserId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowSlaPolicy" ADD CONSTRAINT "WorkflowSlaPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSlaEvent" ADD CONSTRAINT "WorkflowSlaEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSlaEvent" ADD CONSTRAINT "WorkflowSlaEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "WorkflowSlaPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSlaEvent" ADD CONSTRAINT "WorkflowSlaEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSlaEvent" ADD CONSTRAINT "WorkflowSlaEvent_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceException" ADD CONSTRAINT "ComplianceException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceException" ADD CONSTRAINT "ComplianceException_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceException" ADD CONSTRAINT "ComplianceException_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceException" ADD CONSTRAINT "ComplianceException_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceException" ADD CONSTRAINT "ComplianceException_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
