CREATE TABLE "DocumentSequence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT '',
  "suffix" TEXT NOT NULL DEFAULT '',
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "padding" INTEGER NOT NULL DEFAULT 1,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArchivePeriod" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'JOBS_AND_INVOICES',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdByUserId" TEXT,
  "closedByUserId" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArchivePeriod_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Job" ADD COLUMN "archivePeriodId" TEXT;

CREATE UNIQUE INDEX "DocumentSequence_tenantId_kind_key" ON "DocumentSequence"("tenantId", "kind");
CREATE INDEX "DocumentSequence_tenantId_updatedAt_idx" ON "DocumentSequence"("tenantId", "updatedAt");
CREATE UNIQUE INDEX "ArchivePeriod_tenantId_name_key" ON "ArchivePeriod"("tenantId", "name");
CREATE INDEX "ArchivePeriod_tenantId_status_fromDate_toDate_idx" ON "ArchivePeriod"("tenantId", "status", "fromDate", "toDate");
CREATE INDEX "Job_companyId_archivePeriodId_archivedAt_idx" ON "Job"("companyId", "archivePeriodId", "archivedAt");

ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchivePeriod" ADD CONSTRAINT "ArchivePeriod_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_archivePeriodId_fkey"
  FOREIGN KEY ("archivePeriodId") REFERENCES "ArchivePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
