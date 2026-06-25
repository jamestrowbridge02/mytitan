CREATE TABLE "CustomerPaymentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT,
    "provider" TEXT NOT NULL,
    "providerKey" TEXT,
    "providerState" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'manual_pending',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "publicTokenPrefix" TEXT NOT NULL,
    "providerRequestRef" TEXT,
    "providerEventId" TEXT,
    "manualReference" TEXT,
    "actionUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerPaymentRequest_publicTokenHash_key" ON "CustomerPaymentRequest"("publicTokenHash");
CREATE INDEX "CustomerPaymentRequest_tenantId_jobId_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "jobId", "createdAt");
CREATE INDEX "CustomerPaymentRequest_tenantId_customerId_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "customerId", "createdAt");
CREATE INDEX "CustomerPaymentRequest_tenantId_status_dueAt_idx" ON "CustomerPaymentRequest"("tenantId", "status", "dueAt");
CREATE INDEX "CustomerPaymentRequest_providerKey_providerEventId_idx" ON "CustomerPaymentRequest"("providerKey", "providerEventId");
CREATE INDEX "CustomerPaymentRequest_providerRequestRef_idx" ON "CustomerPaymentRequest"("providerRequestRef");

ALTER TABLE "CustomerPaymentRequest"
  ADD CONSTRAINT "CustomerPaymentRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPaymentRequest"
  ADD CONSTRAINT "CustomerPaymentRequest_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPaymentRequest"
  ADD CONSTRAINT "CustomerPaymentRequest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
