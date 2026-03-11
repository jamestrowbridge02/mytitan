DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServicePlanStatus') THEN
    CREATE TYPE "ServicePlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServicePlanCadenceUnit') THEN
    CREATE TYPE "ServicePlanCadenceUnit" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServicePlanRunStatus') THEN
    CREATE TYPE "ServicePlanRunStatus" AS ENUM ('PENDING', 'EXECUTED', 'SKIPPED', 'FAILED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ServicePlan" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ServicePlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "cadenceUnit" "ServicePlanCadenceUnit" NOT NULL,
  "cadenceInterval" INTEGER NOT NULL,
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "autoCreateBooking" BOOLEAN NOT NULL DEFAULT false,
  "autoCreateJob" BOOLEAN NOT NULL DEFAULT false,
  "notesJson" JSONB,
  "portalVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServicePlanTask" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePlanTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServicePlanRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "status" "ServicePlanRunStatus" NOT NULL DEFAULT 'PENDING',
  "bookingId" TEXT,
  "jobId" TEXT,
  "resultJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePlanRun_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePlan_tenantId_fkey') THEN
    ALTER TABLE "ServicePlan"
      ADD CONSTRAINT "ServicePlan_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePlan_customerId_fkey') THEN
    ALTER TABLE "ServicePlan"
      ADD CONSTRAINT "ServicePlan_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePlanTask_planId_fkey') THEN
    ALTER TABLE "ServicePlanTask"
      ADD CONSTRAINT "ServicePlanTask_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePlanRun_tenantId_fkey') THEN
    ALTER TABLE "ServicePlanRun"
      ADD CONSTRAINT "ServicePlanRun_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicePlanRun_planId_fkey') THEN
    ALTER TABLE "ServicePlanRun"
      ADD CONSTRAINT "ServicePlanRun_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "ServicePlanRun_planId_scheduledFor_key"
  ON "ServicePlanRun"("planId", "scheduledFor");

CREATE INDEX IF NOT EXISTS "ServicePlan_tenantId_status_nextRunAt_idx"
  ON "ServicePlan"("tenantId", "status", "nextRunAt");

CREATE INDEX IF NOT EXISTS "ServicePlan_tenantId_customerId_createdAt_idx"
  ON "ServicePlan"("tenantId", "customerId", "createdAt");

CREATE INDEX IF NOT EXISTS "ServicePlanTask_planId_sortOrder_idx"
  ON "ServicePlanTask"("planId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ServicePlanRun_tenantId_status_scheduledFor_idx"
  ON "ServicePlanRun"("tenantId", "status", "scheduledFor");

CREATE INDEX IF NOT EXISTS "ServicePlanRun_tenantId_createdAt_idx"
  ON "ServicePlanRun"("tenantId", "createdAt");
