ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RETURN';

CREATE TABLE IF NOT EXISTS "InventoryCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierItemMapping" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "supplierId" TEXT,
  "supplierName" TEXT,
  "supplierSku" TEXT NOT NULL,
  "supplierReference" TEXT,
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierItemMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TechnicianStockAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "inventoryLocationId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "notesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TechnicianStockAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "fromInventoryLocationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "toInventoryLocationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCategory_tenantId_name_key" ON "InventoryCategory"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "InventoryCategory_tenantId_active_name_idx" ON "InventoryCategory"("tenantId", "active", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierItemMapping_tenantId_stockItemId_supplierSku_key" ON "SupplierItemMapping"("tenantId", "stockItemId", "supplierSku");
CREATE INDEX IF NOT EXISTS "SupplierItemMapping_tenantId_stockItemId_preferred_idx" ON "SupplierItemMapping"("tenantId", "stockItemId", "preferred");
CREATE INDEX IF NOT EXISTS "SupplierItemMapping_tenantId_supplierId_active_idx" ON "SupplierItemMapping"("tenantId", "supplierId", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "TechnicianStockAssignment_tenantId_technicianId_inventoryLocationId_key" ON "TechnicianStockAssignment"("tenantId", "technicianId", "inventoryLocationId");
CREATE INDEX IF NOT EXISTS "TechnicianStockAssignment_tenantId_technicianId_active_idx" ON "TechnicianStockAssignment"("tenantId", "technicianId", "active");
CREATE INDEX IF NOT EXISTS "TechnicianStockAssignment_tenantId_inventoryLocationId_active_idx" ON "TechnicianStockAssignment"("tenantId", "inventoryLocationId", "active");

CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_fromInventoryLocationId_createdAt_idx" ON "StockMovement"("tenantId", "fromInventoryLocationId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_toInventoryLocationId_createdAt_idx" ON "StockMovement"("tenantId", "toInventoryLocationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryCategory_tenantId_fkey') THEN
    ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItemMapping_tenantId_fkey') THEN
    ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItemMapping_stockItemId_fkey') THEN
    ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItemMapping_supplierId_fkey') THEN
    ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "StockSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TechnicianStockAssignment_tenantId_fkey') THEN
    ALTER TABLE "TechnicianStockAssignment" ADD CONSTRAINT "TechnicianStockAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TechnicianStockAssignment_technicianId_fkey') THEN
    ALTER TABLE "TechnicianStockAssignment" ADD CONSTRAINT "TechnicianStockAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TechnicianStockAssignment_inventoryLocationId_fkey') THEN
    ALTER TABLE "TechnicianStockAssignment" ADD CONSTRAINT "TechnicianStockAssignment_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_fromInventoryLocationId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromInventoryLocationId_fkey" FOREIGN KEY ("fromInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_toInventoryLocationId_fkey') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toInventoryLocationId_fkey" FOREIGN KEY ("toInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
