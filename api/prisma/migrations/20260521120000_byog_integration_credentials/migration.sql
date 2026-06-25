-- CreateEnum
CREATE TYPE "TenantIntegrationProvider" AS ENUM (
  'STRIPE_CUSTOMER_PAYMENTS',
  'WORLDPAY',
  'SUMUP',
  'QUICKBOOKS',
  'SAGE',
  'TIDE',
  'GOOGLE_CALENDAR',
  'MICROSOFT_CALENDAR',
  'EMAIL_SENDER',
  'GENERIC_WEBHOOK',
  'GENERIC_API'
);

-- CreateEnum
CREATE TYPE "IntegrationCredentialType" AS ENUM (
  'OAUTH',
  'API_KEY',
  'WEBHOOK_SECRET',
  'MERCHANT_PAYMENT_GATEWAY_CONFIG',
  'ACCOUNTING_CONFIG',
  'CALENDAR_CONFIG'
);

-- CreateEnum
CREATE TYPE "IntegrationCredentialStatus" AS ENUM (
  'SETUP_NEEDED',
  'CONNECTED',
  'NEEDS_REAUTH',
  'DISABLED',
  'ERROR'
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "TenantIntegrationProvider" NOT NULL,
  "credentialType" "IntegrationCredentialType" NOT NULL,
  "scope" "IntegrationConnectionScope" NOT NULL DEFAULT 'WORKSPACE',
  "scopeOwnerKey" TEXT NOT NULL DEFAULT 'workspace',
  "userId" TEXT,
  "displayName" TEXT,
  "status" "IntegrationCredentialStatus" NOT NULL DEFAULT 'SETUP_NEEDED',
  "encryptedPayload" TEXT,
  "encryptedSecretMaterial" TEXT,
  "metadataJson" JSONB,
  "routeId" TEXT NOT NULL,
  "lastVerifiedAt" TIMESTAMP(3),
  "lastWebhookReceivedAt" TIMESTAMP(3),
  "lastErrorCategory" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationCredentialId" TEXT NOT NULL,
  "provider" "TenantIntegrationProvider" NOT NULL,
  "routeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT,
  "status" TEXT NOT NULL,
  "errorCategory" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationWebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_routeId_key" ON "IntegrationCredential"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_tenantId_provider_scope_scopeOwnerKey_key"
ON "IntegrationCredential"("tenantId", "provider", "scope", "scopeOwnerKey");

-- CreateIndex
CREATE INDEX "IntegrationCredential_tenantId_provider_scope_userId_idx"
ON "IntegrationCredential"("tenantId", "provider", "scope", "userId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_provider_routeId_idx"
ON "IntegrationCredential"("provider", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookReceipt_provider_integrationCredentialId_eventId_key"
ON "IntegrationWebhookReceipt"("provider", "integrationCredentialId", "eventId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookReceipt_tenantId_provider_routeId_receivedAt_idx"
ON "IntegrationWebhookReceipt"("tenantId", "provider", "routeId", "receivedAt");

-- AddForeignKey
ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookReceipt"
ADD CONSTRAINT "IntegrationWebhookReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookReceipt"
ADD CONSTRAINT "IntegrationWebhookReceipt_integrationCredentialId_fkey"
FOREIGN KEY ("integrationCredentialId") REFERENCES "IntegrationCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
