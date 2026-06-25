ALTER TABLE "TenantSetting"
ADD COLUMN IF NOT EXISTS "autoConfirmPublicBookings" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TenantSetting"
SET "autoConfirmPublicBookings" = true
WHERE "bookingPublicEnabled" = true
  AND "autoConfirmPublicBookings" = false;

CREATE TABLE IF NOT EXISTS "TenantJobAllowanceOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "monthlyJobAllowance" INTEGER,
  "unlimitedJobs" BOOLEAN NOT NULL DEFAULT false,
  "enterprisePlanNote" TEXT,
  "reason" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantJobAllowanceOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenantJobAllowanceCredit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "creditCount" INTEGER NOT NULL,
  "creditType" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantJobAllowanceCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantJobAllowanceOverride_tenantId_key"
ON "TenantJobAllowanceOverride"("tenantId");

CREATE INDEX IF NOT EXISTS "TenantJobAllowanceOverride_tenantId_updatedAt_idx"
ON "TenantJobAllowanceOverride"("tenantId", "updatedAt");

CREATE INDEX IF NOT EXISTS "TenantJobAllowanceCredit_tenantId_expiresAt_createdAt_idx"
ON "TenantJobAllowanceCredit"("tenantId", "expiresAt", "createdAt");

CREATE INDEX IF NOT EXISTS "TenantJobAllowanceCredit_tenantId_creditType_createdAt_idx"
ON "TenantJobAllowanceCredit"("tenantId", "creditType", "createdAt");

DO $$
BEGIN
  ALTER TABLE "TenantJobAllowanceOverride"
  ADD CONSTRAINT "TenantJobAllowanceOverride_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TenantJobAllowanceOverride"
  ADD CONSTRAINT "TenantJobAllowanceOverride_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TenantJobAllowanceCredit"
  ADD CONSTRAINT "TenantJobAllowanceCredit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TenantJobAllowanceCredit"
  ADD CONSTRAINT "TenantJobAllowanceCredit_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
