CREATE TABLE "OutboundEmailControl" (
  "id" TEXT NOT NULL,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "pausedReason" TEXT,
  "pausedAt" TIMESTAMP(3),
  "pausedByUserId" TEXT,
  "providerSuspended" BOOLEAN NOT NULL DEFAULT false,
  "providerSuspensionReason" TEXT,
  "providerSuspendedAt" TIMESTAMP(3),
  "environment" TEXT NOT NULL,
  "allowLiveSmtpInNonProd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundEmailControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundEmailSuppression" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3),
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "lastMatchedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundEmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundEmailEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "userId" TEXT,
  "environment" TEXT NOT NULL,
  "senderOwnership" TEXT,
  "category" TEXT NOT NULL,
  "templateKey" TEXT,
  "recipientEmailHash" TEXT NOT NULL,
  "recipientMasked" TEXT NOT NULL,
  "recipientDomain" TEXT NOT NULL,
  "subjectHash" TEXT,
  "dedupeKey" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "providerCode" TEXT,
  "responseSummary" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundEmailSuppression_email_status_expiresAt_idx"
  ON "OutboundEmailSuppression"("email", "status", "expiresAt");

CREATE INDEX "OutboundEmailSuppression_companyId_email_status_expiresAt_idx"
  ON "OutboundEmailSuppression"("companyId", "email", "status", "expiresAt");

CREATE INDEX "OutboundEmailSuppression_category_status_createdAt_idx"
  ON "OutboundEmailSuppression"("category", "status", "createdAt");

CREATE INDEX "OutboundEmailEvent_companyId_createdAt_idx"
  ON "OutboundEmailEvent"("companyId", "createdAt");

CREATE INDEX "OutboundEmailEvent_status_createdAt_idx"
  ON "OutboundEmailEvent"("status", "createdAt");

CREATE INDEX "OutboundEmailEvent_recipientEmailHash_createdAt_idx"
  ON "OutboundEmailEvent"("recipientEmailHash", "createdAt");

CREATE INDEX "OutboundEmailEvent_dedupeKey_createdAt_idx"
  ON "OutboundEmailEvent"("dedupeKey", "createdAt");

CREATE INDEX "OutboundEmailEvent_category_createdAt_idx"
  ON "OutboundEmailEvent"("category", "createdAt");
