-- CreateEnum
CREATE TYPE "WheelPricingMode" AS ENUM ('PER_WHEEL', 'SET');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('JOB_NOTIFICATION', 'INVOICE', 'BOOKING_CONFIRMATION');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "serviceName" TEXT,
ADD COLUMN     "whatsappTemplate" TEXT,
ADD COLUMN     "wheelPricingMode" "WheelPricingMode";

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT,
    "logoUrl" TEXT,
    "brandPrimaryColor" TEXT NOT NULL DEFAULT '#4fd1c5',
    "brandSecondaryColor" TEXT NOT NULL DEFAULT '#1a1f36',
    "brandAccentColor" TEXT,
    "brandDefaultMode" TEXT NOT NULL DEFAULT 'dark',
    "emailSenderName" TEXT,
    "emailReplyTo" TEXT,
    "emailNotificationRecipients" JSONB,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "whatsappTemplateDefault" TEXT,
    "vatEnabledDefault" BOOLEAN NOT NULL DEFAULT false,
    "vatRateBpsDefault" INTEGER NOT NULL DEFAULT 0,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-US',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultItems" JSONB,
    "defaultServiceNamePresets" JSONB,
    "defaultWheelPricingMode" "WheelPricingMode",
    "bookingsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accountingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "socialEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "defaultQty" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_key" ON "TenantSetting"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_tenantId_active_idx" ON "ServiceCatalogItem"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantId_type_key" ON "EmailTemplate"("tenantId", "type");

-- CreateIndex
CREATE INDEX "AiChatAudit_tenantId_createdAt_idx" ON "AiChatAudit"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatAudit" ADD CONSTRAINT "AiChatAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatAudit" ADD CONSTRAINT "AiChatAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
