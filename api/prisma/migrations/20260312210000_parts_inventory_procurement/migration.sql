-- AlterEnum
ALTER TYPE "StockPurchaseOrderStatus" ADD VALUE 'PARTIALLY_RECEIVED';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVE';
ALTER TYPE "StockMovementType" ADD VALUE 'RELEASE';
ALTER TYPE "StockMovementType" ADD VALUE 'USE';

-- CreateEnum
CREATE TYPE "InventoryLocationKind" AS ENUM ('WAREHOUSE', 'VAN', 'OFFICE', 'SUPPLIER_VIRTUAL');

-- CreateEnum
CREATE TYPE "JobPartStatus" AS ENUM ('PLANNED', 'RESERVED', 'USED', 'CANCELLED');

-- AlterTable
ALTER TABLE "StockItem"
ADD COLUMN "description" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "metadataJson" JSONB;

-- AlterTable
ALTER TABLE "StockPurchaseOrder"
ADD COLUMN "inventoryLocationId" TEXT,
ADD COLUMN "supplierName" TEXT,
ADD COLUMN "orderedAt" TIMESTAMP(3),
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "notesJson" JSONB;

-- AlterTable
ALTER TABLE "StockPOLine"
ADD COLUMN "qtyReceived" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement"
ADD COLUMN "inventoryLocationId" TEXT;

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InventoryLocationKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "inventoryLocationId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantityPlanned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantityUsed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "sourceLocationId" TEXT,
    "status" "JobPartStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_tenantId_name_key" ON "InventoryLocation"("tenantId", "name");

-- CreateIndex
CREATE INDEX "InventoryLocation_tenantId_kind_active_idx" ON "InventoryLocation"("tenantId", "kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_tenantId_stockItemId_inventoryLocationId_key" ON "InventoryStock"("tenantId", "stockItemId", "inventoryLocationId");

-- CreateIndex
CREATE INDEX "InventoryStock_tenantId_inventoryLocationId_updatedAt_idx" ON "InventoryStock"("tenantId", "inventoryLocationId", "updatedAt");

-- CreateIndex
CREATE INDEX "InventoryStock_tenantId_stockItemId_updatedAt_idx" ON "InventoryStock"("tenantId", "stockItemId", "updatedAt");

-- CreateIndex
CREATE INDEX "JobPart_tenantId_jobId_status_createdAt_idx" ON "JobPart"("tenantId", "jobId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JobPart_tenantId_stockItemId_status_idx" ON "JobPart"("tenantId", "stockItemId", "status");

-- CreateIndex
CREATE INDEX "JobPart_tenantId_sourceLocationId_status_idx" ON "JobPart"("tenantId", "sourceLocationId", "status");

-- CreateIndex
CREATE INDEX "StockPurchaseOrder_tenantId_inventoryLocationId_idx" ON "StockPurchaseOrder"("tenantId", "inventoryLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_inventoryLocationId_createdAt_idx" ON "StockMovement"("tenantId", "inventoryLocationId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPart" ADD CONSTRAINT "JobPart_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseOrder" ADD CONSTRAINT "StockPurchaseOrder_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
