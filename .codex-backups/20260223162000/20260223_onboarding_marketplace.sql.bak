ALTER TABLE "TenantSetting"
  ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "featurePayments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureAccounting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureBookings" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureSocial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureAI" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureCustomerPortal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featureWhatsApp" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TenantSetting_updatedAt_idx" ON "TenantSetting"("updatedAt");

UPDATE "TenantSetting"
SET
  "featurePayments" = COALESCE("paymentsEnabled", false),
  "featureBookings" = COALESCE("bookingsEnabled", false),
  "featureAccounting" = COALESCE("accountingEnabled", false),
  "featureSocial" = COALESCE("socialEnabled", false),
  "featureAI" = COALESCE("aiEnabled", false);
