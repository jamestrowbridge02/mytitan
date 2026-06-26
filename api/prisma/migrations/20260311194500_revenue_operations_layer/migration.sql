DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerApprovalEntityType') THEN
    ALTER TYPE "CustomerApprovalEntityType" ADD VALUE IF NOT EXISTS 'QUOTE';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED', 'CONVERTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuoteLineItemType" AS ENUM ('LABOUR', 'PART', 'FEE', 'DISCOUNT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RevenueCollectionTaskKind" AS ENUM ('QUOTE_FOLLOW_UP', 'INVOICE_FOLLOW_UP', 'APPROVAL_FOLLOW_UP', 'PAYMENT_FOLLOW_UP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RevenueCollectionTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Quote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "jobId" TEXT,
  "bookingId" TEXT,
  "quoteNumber" TEXT NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuoteLineItem" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "type" "QuoteLineItemType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "totalPriceCents" INTEGER NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RevenueCollectionTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "jobId" TEXT,
  "quoteId" TEXT,
  "customerId" TEXT NOT NULL,
  "kind" "RevenueCollectionTaskKind" NOT NULL,
  "status" "RevenueCollectionTaskStatus" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "notesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueCollectionTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Quote_tenantId_quoteNumber_key" ON "Quote"("tenantId", "quoteNumber");
CREATE INDEX IF NOT EXISTS "Quote_tenantId_status_createdAt_idx" ON "Quote"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Quote_tenantId_customerId_createdAt_idx" ON "Quote"("tenantId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Quote_tenantId_jobId_idx" ON "Quote"("tenantId", "jobId");
CREATE INDEX IF NOT EXISTS "Quote_tenantId_bookingId_idx" ON "Quote"("tenantId", "bookingId");
CREATE INDEX IF NOT EXISTS "QuoteLineItem_quoteId_sortOrder_idx" ON "QuoteLineItem"("quoteId", "sortOrder");
CREATE INDEX IF NOT EXISTS "RevenueCollectionTask_tenantId_status_dueAt_idx" ON "RevenueCollectionTask"("tenantId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "RevenueCollectionTask_tenantId_customerId_status_idx" ON "RevenueCollectionTask"("tenantId", "customerId", "status");
CREATE INDEX IF NOT EXISTS "RevenueCollectionTask_tenantId_kind_status_idx" ON "RevenueCollectionTask"("tenantId", "kind", "status");
CREATE INDEX IF NOT EXISTS "RevenueCollectionTask_tenantId_quoteId_kind_idx" ON "RevenueCollectionTask"("tenantId", "quoteId", "kind");
CREATE INDEX IF NOT EXISTS "RevenueCollectionTask_tenantId_jobId_kind_idx" ON "RevenueCollectionTask"("tenantId", "jobId", "kind");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_tenantId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_customerId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_jobId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_bookingId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuoteLineItem_quoteId_fkey'
  ) THEN
    ALTER TABLE "QuoteLineItem"
      ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RevenueCollectionTask_tenantId_fkey'
  ) THEN
    ALTER TABLE "RevenueCollectionTask"
      ADD CONSTRAINT "RevenueCollectionTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RevenueCollectionTask_jobId_fkey'
  ) THEN
    ALTER TABLE "RevenueCollectionTask"
      ADD CONSTRAINT "RevenueCollectionTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RevenueCollectionTask_quoteId_fkey'
  ) THEN
    ALTER TABLE "RevenueCollectionTask"
      ADD CONSTRAINT "RevenueCollectionTask_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RevenueCollectionTask_customerId_fkey'
  ) THEN
    ALTER TABLE "RevenueCollectionTask"
      ADD CONSTRAINT "RevenueCollectionTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
