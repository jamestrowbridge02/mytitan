-- CreateEnum
CREATE TYPE "PerformancePeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PerformanceRoleType" AS ENUM ('TECHNICIAN', 'DISPATCHER', 'FINANCE', 'MANAGER');

-- CreateEnum
CREATE TYPE "CompensationMetricType" AS ENUM ('JOBS_COMPLETED', 'SLA_MET_RATE', 'QUOTE_CONVERSION_RATE', 'COLLECTIONS_COMPLETED', 'UTILIZATION_RATE', 'ACKNOWLEDGEMENT_RATE', 'EXECUTION_SUBMITTED_RATE');

-- CreateEnum
CREATE TYPE "CompensationCalculationType" AS ENUM ('FLAT_BONUS', 'PERCENTAGE_BONUS', 'THRESHOLD_BONUS');

-- CreateEnum
CREATE TYPE "CompensationRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "PerformancePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PerformancePeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceScorecard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT,
    "periodId" TEXT NOT NULL,
    "roleType" "PerformanceRoleType" NOT NULL,
    "metricsJson" JSONB,
    "scoreJson" JSONB,
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleType" "PerformanceRoleType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metricType" "CompensationMetricType" NOT NULL,
    "calculationType" "CompensationCalculationType" NOT NULL,
    "thresholdJson" JSONB,
    "payoutJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "CompensationRunStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "calculationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformancePeriod_tenantId_status_startsAt_idx" ON "PerformancePeriod"("tenantId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceScorecard_tenantId_userId_periodId_roleType_locatio_key" ON "PerformanceScorecard"("tenantId", "userId", "periodId", "roleType", "locationId");

-- CreateIndex
CREATE INDEX "PerformanceScorecard_tenantId_periodId_roleType_idx" ON "PerformanceScorecard"("tenantId", "periodId", "roleType");

-- CreateIndex
CREATE INDEX "PerformanceScorecard_tenantId_locationId_periodId_idx" ON "PerformanceScorecard"("tenantId", "locationId", "periodId");

-- CreateIndex
CREATE INDEX "CompensationRule_tenantId_roleType_active_idx" ON "CompensationRule"("tenantId", "roleType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationRun_tenantId_periodId_userId_ruleId_key" ON "CompensationRun"("tenantId", "periodId", "userId", "ruleId");

-- CreateIndex
CREATE INDEX "CompensationRun_tenantId_status_periodId_idx" ON "CompensationRun"("tenantId", "status", "periodId");

-- AddForeignKey
ALTER TABLE "PerformancePeriod" ADD CONSTRAINT "PerformancePeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScorecard" ADD CONSTRAINT "PerformanceScorecard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScorecard" ADD CONSTRAINT "PerformanceScorecard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScorecard" ADD CONSTRAINT "PerformanceScorecard_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScorecard" ADD CONSTRAINT "PerformanceScorecard_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRun" ADD CONSTRAINT "CompensationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRun" ADD CONSTRAINT "CompensationRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PerformancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRun" ADD CONSTRAINT "CompensationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRun" ADD CONSTRAINT "CompensationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CompensationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
