CREATE TABLE "BillingCatalogSync" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "snapshotJson" JSONB,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingCatalogSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCatalogSync_key_key" ON "BillingCatalogSync"("key");
