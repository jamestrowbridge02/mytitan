-- Top 1% premium/security/locations/inventory v1

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onlyMyLocation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "bookingLeadTimeMins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "defaultAssigneeId" TEXT;

ALTER TABLE "StockItem"
  ADD COLUMN IF NOT EXISTS "avgUnitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

CREATE TABLE IF NOT EXISTS "SavedCommandView" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filtersJson" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedCommandView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserUndoAction" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "UserUndoAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LocationBusinessHour" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocationBusinessHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LocationStaffAssignment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocationStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobLineItem" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "stockItemId" TEXT,
  "description" TEXT NOT NULL,
  "qty" DECIMAL(14,2) NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationBusinessHour_locationId_weekday_key" ON "LocationBusinessHour"("locationId", "weekday");
CREATE UNIQUE INDEX IF NOT EXISTS "LocationStaffAssignment_locationId_userId_key" ON "LocationStaffAssignment"("locationId", "userId");

CREATE INDEX IF NOT EXISTS "SavedCommandView_companyId_userId_createdAt_idx" ON "SavedCommandView"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SavedCommandView_companyId_userId_isDefault_idx" ON "SavedCommandView"("companyId", "userId", "isDefault");
CREATE INDEX IF NOT EXISTS "UserUndoAction_companyId_userId_createdAt_idx" ON "UserUndoAction"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UserUndoAction_companyId_userId_expiresAt_idx" ON "UserUndoAction"("companyId", "userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "UserUndoAction_companyId_userId_consumedAt_idx" ON "UserUndoAction"("companyId", "userId", "consumedAt");
CREATE INDEX IF NOT EXISTS "Location_companyId_defaultAssigneeId_idx" ON "Location"("companyId", "defaultAssigneeId");
CREATE INDEX IF NOT EXISTS "LocationBusinessHour_companyId_locationId_idx" ON "LocationBusinessHour"("companyId", "locationId");
CREATE INDEX IF NOT EXISTS "LocationStaffAssignment_companyId_userId_idx" ON "LocationStaffAssignment"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "LocationStaffAssignment_companyId_locationId_idx" ON "LocationStaffAssignment"("companyId", "locationId");
CREATE INDEX IF NOT EXISTS "JobLineItem_companyId_jobId_createdAt_idx" ON "JobLineItem"("companyId", "jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobLineItem_companyId_stockItemId_idx" ON "JobLineItem"("companyId", "stockItemId");
CREATE INDEX IF NOT EXISTS "StockItem_tenantId_supplierId_idx" ON "StockItem"("tenantId", "supplierId");

DO $$ BEGIN
  ALTER TABLE "Location" ADD CONSTRAINT "Location_defaultAssigneeId_fkey"
    FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "StockSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SavedCommandView" ADD CONSTRAINT "SavedCommandView_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SavedCommandView" ADD CONSTRAINT "SavedCommandView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserUndoAction" ADD CONSTRAINT "UserUndoAction_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserUndoAction" ADD CONSTRAINT "UserUndoAction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LocationBusinessHour" ADD CONSTRAINT "LocationBusinessHour_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LocationBusinessHour" ADD CONSTRAINT "LocationBusinessHour_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LocationStaffAssignment" ADD CONSTRAINT "LocationStaffAssignment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LocationStaffAssignment" ADD CONSTRAINT "LocationStaffAssignment_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LocationStaffAssignment" ADD CONSTRAINT "LocationStaffAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
