-- Ensure fresh database deployments include ActivityEvent, which older environments
-- may already have from pre-release/manual schema history.
CREATE TABLE IF NOT EXISTS "ActivityEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" TEXT,
  "customerId" TEXT,
  "jobId" TEXT,
  "jobRef" TEXT,
  "customerName" TEXT,
  "status" TEXT,
  "vehicleReg" TEXT,
  "technicianId" TEXT,
  "payloadJson" JSONB,
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ActivityEvent_customerId_fkey'
  ) THEN
    ALTER TABLE "ActivityEvent"
      ADD CONSTRAINT "ActivityEvent_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "ActivityEvent_at_idx" ON "ActivityEvent"("at");
CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_at_idx" ON "ActivityEvent"("tenantId", "at");
CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_customerId_at_idx" ON "ActivityEvent"("tenantId", "customerId", "at");
CREATE INDEX IF NOT EXISTS "ActivityEvent_jobId_at_idx" ON "ActivityEvent"("jobId", "at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerApprovalEntityType') THEN
    ALTER TYPE "CustomerApprovalEntityType" ADD VALUE IF NOT EXISTS 'QUOTE';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;
