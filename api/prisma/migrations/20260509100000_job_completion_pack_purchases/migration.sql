-- CreateTable
CREATE TABLE "JobCompletionPackPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeEventId" TEXT,
    "productId" TEXT,
    "priceId" TEXT,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "jobCompletionCount" INTEGER NOT NULL,
    "purchasePeriodStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobCompletionPackPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCompletionPackPurchase_checkoutSessionId_key" ON "JobCompletionPackPurchase"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "JobCompletionPackPurchase_tenantId_purchasePeriodStart_status_idx" ON "JobCompletionPackPurchase"("tenantId", "purchasePeriodStart", "status");

-- CreateIndex
CREATE INDEX "JobCompletionPackPurchase_tenantId_createdAt_idx" ON "JobCompletionPackPurchase"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "JobCompletionPackPurchase" ADD CONSTRAINT "JobCompletionPackPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
