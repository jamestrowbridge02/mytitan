CREATE TABLE "PlatformPaymentProviderConfig" (
  "id" TEXT NOT NULL DEFAULT 'stripe_connect',
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'test',
  "platformSecretEncrypted" TEXT,
  "platformSecretLastFour" TEXT,
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

  CONSTRAINT "PlatformPaymentProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPaymentProviderConfig_provider_key"
ON "PlatformPaymentProviderConfig"("provider");

CREATE INDEX "PlatformPaymentProviderConfig_provider_updatedAt_idx"
ON "PlatformPaymentProviderConfig"("provider", "updatedAt");
