CREATE TABLE "PlatformEmailProviderConfig" (
    "id" TEXT NOT NULL DEFAULT 'system_email',
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "host" TEXT,
    "port" INTEGER,
    "tlsMode" TEXT NOT NULL DEFAULT 'starttls',
    "username" TEXT,
    "secretEncrypted" TEXT,
    "secretLastFour" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "replyToEmail" TEXT,
    "operatorTestRecipient" TEXT,
    "spfStatus" TEXT NOT NULL DEFAULT 'unknown',
    "dkimStatus" TEXT NOT NULL DEFAULT 'unknown',
    "dmarcStatus" TEXT NOT NULL DEFAULT 'unknown',
    "evidence" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'missing',
    "verifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformEmailProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformExternalMonitorConfig" (
    "id" TEXT NOT NULL DEFAULT 'external_monitor',
    "provider" TEXT,
    "name" TEXT,
    "marketingUrl" TEXT,
    "appUrl" TEXT,
    "apiHealthUrl" TEXT,
    "alertRecipient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "evidence" TEXT,
    "manualReason" TEXT,
    "failureReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformExternalMonitorConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformEmailProviderConfig_provider_updatedAt_idx" ON "PlatformEmailProviderConfig"("provider", "updatedAt");
CREATE INDEX "PlatformExternalMonitorConfig_status_updatedAt_idx" ON "PlatformExternalMonitorConfig"("status", "updatedAt");
