-- Inventory V1

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockPurchaseOrderStatus') THEN
    CREATE TYPE "StockPurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockMovementType') THEN
    CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "StockItem" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "minLevel" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StockSupplier" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StockPurchaseOrder" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "supplierId" TEXT,
  "status" "StockPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StockPOLine" (
  "id" TEXT PRIMARY KEY,
  "poId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "qtyOrdered" DECIMAL(14,2) NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT,
  "stockItemId" TEXT NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "qty" DECIMAL(14,2) NOT NULL,
  "reason" TEXT,
  "jobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockItem_tenantId_fkey') THEN
    ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockItem_locationId_fkey') THEN
    ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockSupplier_tenantId_fkey') THEN
    ALTER TABLE "StockSupplier" ADD CONSTRAINT "StockSupplier_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockPurchaseOrder_tenantId_fkey') THEN
    ALTER TABLE "StockPurchaseOrder" ADD CONSTRAINT "StockPurchaseOrder_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockPurchaseOrder_locationId_fkey') THEN
    ALTER TABLE "StockPurchaseOrder" ADD CONSTRAINT "StockPurchaseOrder_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockPurchaseOrder_supplierId_fkey') THEN
    ALTER TABLE "StockPurchaseOrder" ADD CONSTRAINT "StockPurchaseOrder_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "StockSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockPOLine_poId_fkey') THEN
    ALTER TABLE "StockPOLine" ADD CONSTRAINT "StockPOLine_poId_fkey"
      FOREIGN KEY ("poId") REFERENCES "StockPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockPOLine_stockItemId_fkey') THEN
    ALTER TABLE "StockPOLine" ADD CONSTRAINT "StockPOLine_stockItemId_fkey"
      FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_tenantId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_locationId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_stockItemId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey"
      FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_jobId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_tenantId_sku_key" ON "StockItem"("tenantId", "sku");
CREATE INDEX IF NOT EXISTS "StockItem_tenantId_locationId_idx" ON "StockItem"("tenantId", "locationId");
CREATE INDEX IF NOT EXISTS "StockItem_tenantId_createdAt_idx" ON "StockItem"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockSupplier_tenantId_createdAt_idx" ON "StockSupplier"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockPurchaseOrder_tenantId_createdAt_idx" ON "StockPurchaseOrder"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockPurchaseOrder_tenantId_locationId_idx" ON "StockPurchaseOrder"("tenantId", "locationId");
CREATE INDEX IF NOT EXISTS "StockPOLine_poId_createdAt_idx" ON "StockPOLine"("poId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_stockItemId_createdAt_idx" ON "StockMovement"("tenantId", "stockItemId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_locationId_createdAt_idx" ON "StockMovement"("tenantId", "locationId", "createdAt");
