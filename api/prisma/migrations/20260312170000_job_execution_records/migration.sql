-- CreateEnum
CREATE TYPE "JobExecutionRecordStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ACKNOWLEDGED', 'REVISED');

-- CreateEnum
CREATE TYPE "JobExecutionEvidenceKind" AS ENUM ('PHOTO', 'SIGNATURE', 'NOTE', 'CHECKLIST_ATTACHMENT', 'CUSTOMER_ACKNOWLEDGEMENT');

-- CreateTable
CREATE TABLE "JobExecutionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "technicianId" TEXT,
    "status" "JobExecutionRecordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "summary" TEXT,
    "checklistJson" JSONB,
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecutionEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "executionRecordId" TEXT NOT NULL,
    "kind" "JobExecutionEvidenceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "artifactId" TEXT,
    "payloadJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecutionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobExecutionRecord_tenantId_jobId_createdAt_idx" ON "JobExecutionRecord"("tenantId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobExecutionRecord_tenantId_technicianId_status_createdAt_idx" ON "JobExecutionRecord"("tenantId", "technicianId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JobExecutionRecord_tenantId_status_updatedAt_idx" ON "JobExecutionRecord"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "JobExecutionEvidence_tenantId_jobId_createdAt_idx" ON "JobExecutionEvidence"("tenantId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobExecutionEvidence_tenantId_executionRecordId_createdAt_idx" ON "JobExecutionEvidence"("tenantId", "executionRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "JobExecutionEvidence_tenantId_kind_createdAt_idx" ON "JobExecutionEvidence"("tenantId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "JobExecutionRecord" ADD CONSTRAINT "JobExecutionRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionRecord" ADD CONSTRAINT "JobExecutionRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionRecord" ADD CONSTRAINT "JobExecutionRecord_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvidence" ADD CONSTRAINT "JobExecutionEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvidence" ADD CONSTRAINT "JobExecutionEvidence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvidence" ADD CONSTRAINT "JobExecutionEvidence_executionRecordId_fkey" FOREIGN KEY ("executionRecordId") REFERENCES "JobExecutionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvidence" ADD CONSTRAINT "JobExecutionEvidence_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "DocumentArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionEvidence" ADD CONSTRAINT "JobExecutionEvidence_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
