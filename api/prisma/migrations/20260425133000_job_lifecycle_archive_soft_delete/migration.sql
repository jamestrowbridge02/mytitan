-- AlterTable
ALTER TABLE "Job"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedByUserId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT,
ADD COLUMN "deletionReason" TEXT;

-- CreateIndex
CREATE INDEX "Job_companyId_archivedAt_idx" ON "Job"("companyId", "archivedAt");

-- CreateIndex
CREATE INDEX "Job_companyId_deletedAt_idx" ON "Job"("companyId", "deletedAt");
