ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'JOB';
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "statementId" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "relatedRecordLabel" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "recipientPhone" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "description" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "reference" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "deliveryChannel" TEXT;
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "CustomerPaymentRequest" ADD COLUMN "expiredAt" TIMESTAMP(3);

ALTER TABLE "CustomerPaymentRequest" DROP CONSTRAINT "CustomerPaymentRequest_jobId_fkey";
ALTER TABLE "CustomerPaymentRequest" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "CustomerPaymentRequest"
  ADD CONSTRAINT "CustomerPaymentRequest_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CustomerPaymentRequest_tenantId_sourceType_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "sourceType", "createdAt");
CREATE INDEX "CustomerPaymentRequest_tenantId_statementId_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "statementId", "createdAt");
CREATE INDEX "CustomerPaymentRequest_tenantId_bookingId_createdAt_idx" ON "CustomerPaymentRequest"("tenantId", "bookingId", "createdAt");
