-- CreateEnum
CREATE TYPE "CustomFieldEntityType" AS ENUM ('JOB', 'BOOKING', 'CUSTOMER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'BOOLEAN', 'DATE');

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "optionsJson" JSONB,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_tenantId_entityType_key_key" ON "CustomField"("tenantId", "entityType", "key");

-- CreateIndex
CREATE INDEX "CustomField_tenantId_entityType_visible_idx" ON "CustomField"("tenantId", "entityType", "visible");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_fieldId_entityId_key" ON "CustomFieldValue"("fieldId", "entityId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_entityType_entityId_idx" ON "CustomFieldValue"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
