CREATE TABLE "PlatformBillingStripeConfig" (
  "id" TEXT NOT NULL DEFAULT 'mytitan_billing_stripe',
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'test',
  "billingSecretEncrypted" TEXT,
  "billingSecretLastFour" TEXT,
  "webhookSecretEncrypted" TEXT,
  "webhookSecretLastFour" TEXT,
  "credentialStatus" TEXT NOT NULL DEFAULT 'missing',
  "credentialVerifiedAt" TIMESTAMP(3),
  "credentialFailureReason" TEXT,
  "webhookStatus" TEXT NOT NULL DEFAULT 'missing',
  "webhookVerifiedAt" TIMESTAMP(3),
  "webhookFailureReason" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformBillingStripeConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformBillingStripeConfig_provider_key"
ON "PlatformBillingStripeConfig"("provider");

CREATE INDEX "PlatformBillingStripeConfig_provider_updatedAt_idx"
ON "PlatformBillingStripeConfig"("provider", "updatedAt");
