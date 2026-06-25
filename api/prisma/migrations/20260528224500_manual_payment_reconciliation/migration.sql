ALTER TABLE "CustomerPaymentRequest"
  ADD COLUMN "manualMethod" TEXT,
  ADD COLUMN "amountReceivedCents" INTEGER,
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "receivedByUserId" TEXT,
  ADD COLUMN "evidenceArtifactId" TEXT,
  ADD COLUMN "internalNote" TEXT,
  ADD COLUMN "customerReceiptNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "CustomerPaymentRequest_tenantId_reviewedAt_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "reviewedAt", "createdAt");
CREATE INDEX "CustomerPaymentRequest_evidenceArtifactId_idx" ON "CustomerPaymentRequest"("evidenceArtifactId");
