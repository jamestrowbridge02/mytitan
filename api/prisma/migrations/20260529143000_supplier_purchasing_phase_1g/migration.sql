ALTER TYPE "StockPurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED_INTERNAL';
ALTER TYPE "StockPurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE "StockSupplier"
  ADD COLUMN IF NOT EXISTS "capabilityMetadataJson" JSONB,
  ADD COLUMN IF NOT EXISTS "internalOnly" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StockPurchaseOrder"
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supplierSnapshotJson" JSONB,
  ADD COLUMN IF NOT EXISTS "internalOnly" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StockPOLine"
  ADD COLUMN IF NOT EXISTS "sourceJobId" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierSku" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierReference" TEXT,
  ADD COLUMN IF NOT EXISTS "pricingSnapshotJson" JSONB,
  ADD COLUMN IF NOT EXISTS "notesJson" JSONB;

CREATE INDEX IF NOT EXISTS "StockPurchaseOrder_tenantId_status_createdAt_idx" ON "StockPurchaseOrder"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "StockPurchaseOrder_tenantId_createdByUserId_idx" ON "StockPurchaseOrder"("tenantId", "createdByUserId");
CREATE INDEX IF NOT EXISTS "StockPurchaseOrder_tenantId_approvedByUserId_idx" ON "StockPurchaseOrder"("tenantId", "approvedByUserId");
CREATE INDEX IF NOT EXISTS "StockPOLine_stockItemId_idx" ON "StockPOLine"("stockItemId");
CREATE INDEX IF NOT EXISTS "StockPOLine_sourceJobId_idx" ON "StockPOLine"("sourceJobId");
