ALTER TABLE "User" ADD COLUMN "color" TEXT;
ALTER TABLE "Location" ADD COLUMN "color" TEXT;
ALTER TABLE "Service" ADD COLUMN "color" TEXT;
ALTER TABLE "StockSupplier" ADD COLUMN "color" TEXT;

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CREATE',
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "headersJson" JSONB NOT NULL,
    "mappingJson" JSONB NOT NULL,
    "rowsJson" JSONB NOT NULL,
    "validationJson" JSONB NOT NULL,
    "createdRefsJson" JSONB,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_companyId_createdAt_idx" ON "ImportBatch"("companyId", "createdAt");
CREATE INDEX "ImportBatch_companyId_status_createdAt_idx" ON "ImportBatch"("companyId", "status", "createdAt");

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
