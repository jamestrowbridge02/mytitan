ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "registeredBusinessName" TEXT,
  ADD COLUMN IF NOT EXISTS "tradingName" TEXT,
  ADD COLUMN IF NOT EXISTS "companyNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "taxRegistrationNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "businessAddressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "businessAddressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "businessCity" TEXT,
  ADD COLUMN IF NOT EXISTS "businessPostcode" TEXT,
  ADD COLUMN IF NOT EXISTS "businessCountry" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "businessDisplayJson" JSONB;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER;

ALTER TABLE "TradeAccount"
  ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowedServiceIdsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "allowedLocationIdsJson" JSONB;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "invoicePaymentTermsDays" INTEGER;

CREATE TABLE IF NOT EXISTS "AccountStatement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT,
  "tradeAccountId" TEXT,
  "reference" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "openBalanceCents" INTEGER NOT NULL DEFAULT 0,
  "paidTotalCents" INTEGER NOT NULL DEFAULT 0,
  "overdueTotalCents" INTEGER NOT NULL DEFAULT 0,
  "invoiceCount" INTEGER NOT NULL DEFAULT 0,
  "linesJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "sentTo" TEXT,
  "sentAt" TIMESTAMP(3),
  "sendDedupeKey" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountStatement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccountStatement_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountStatement_tenantId_reference_key" ON "AccountStatement"("tenantId", "reference");
CREATE INDEX IF NOT EXISTS "AccountStatement_tenantId_customerId_createdAt_idx" ON "AccountStatement"("tenantId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccountStatement_tenantId_tradeAccountId_createdAt_idx" ON "AccountStatement"("tenantId", "tradeAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccountStatement_tenantId_sentAt_idx" ON "AccountStatement"("tenantId", "sentAt");

CREATE TABLE IF NOT EXISTS "TradePortalAccess" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "contactId" TEXT,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "inviteTokenHash" TEXT,
  "inviteTokenExpiresAt" TIMESTAMP(3),
  "invitedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradePortalAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradePortalAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradePortalAccess_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradePortalAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "TradeAccountContact"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TradePortalAccess_tenantId_tradeAccountId_email_key" ON "TradePortalAccess"("tenantId", "tradeAccountId", "email");
CREATE INDEX IF NOT EXISTS "TradePortalAccess_tenantId_status_idx" ON "TradePortalAccess"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TradePortalAccess_inviteTokenHash_idx" ON "TradePortalAccess"("inviteTokenHash");

CREATE TABLE IF NOT EXISTS "TradeAccountApplicationSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "publicToken" TEXT NOT NULL,
  "fieldsJson" JSONB,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeAccountApplicationSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeAccountApplicationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TradeAccountApplicationSetting_tenantId_key" ON "TradeAccountApplicationSetting"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TradeAccountApplicationSetting_publicToken_key" ON "TradeAccountApplicationSetting"("publicToken");

CREATE TABLE IF NOT EXISTS "TradeAccountApplication" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "publicStatusToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "businessName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "companyNumber" TEXT,
  "taxRegistrationNumber" TEXT,
  "answersJson" JSONB,
  "documentArtifactsJson" JSONB,
  "reviewNote" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "convertedTradeAccountId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeAccountApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeAccountApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TradeAccountApplication_publicStatusToken_key" ON "TradeAccountApplication"("publicStatusToken");
CREATE INDEX IF NOT EXISTS "TradeAccountApplication_tenantId_status_submittedAt_idx" ON "TradeAccountApplication"("tenantId", "status", "submittedAt");

INSERT INTO "BookingQuestion" (
  "id", "companyId", "label", "questionKey", "type", "required", "optionsJson", "isActive", "createdAt", "updatedAt"
)
SELECT
  'wheel_reg_' || md5(c."id"),
  c."id",
  'Reg Number',
  'vehicle_registration',
  'vehicle_registration',
  true,
  '{"placeholder":"Reg Number","visibility":"PUBLIC","scope":{"allBookings":true},"sortOrder":30}'::jsonb,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE lower(c."name") IN ('wheel a&r', 'wheel a&e')
ON CONFLICT ("companyId", "questionKey") DO UPDATE SET
  "label" = EXCLUDED."label",
  "type" = EXCLUDED."type",
  "required" = true,
  "isActive" = true,
  "optionsJson" = EXCLUDED."optionsJson",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "BookingQuestion" (
  "id", "companyId", "label", "questionKey", "type", "required", "optionsJson", "isActive", "createdAt", "updatedAt"
)
SELECT
  'wheel_nut_' || md5(c."id"),
  c."id",
  'Locking Wheel Nut Readily Available?',
  'locking_wheel_nut',
  'checkbox',
  true,
  '{"visibility":"PUBLIC","scope":{"allBookings":true},"sortOrder":40,"consentMode":true}'::jsonb,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE lower(c."name") IN ('wheel a&r', 'wheel a&e')
ON CONFLICT ("companyId", "questionKey") DO UPDATE SET
  "label" = EXCLUDED."label",
  "type" = EXCLUDED."type",
  "required" = true,
  "isActive" = true,
  "optionsJson" = EXCLUDED."optionsJson",
  "updatedAt" = CURRENT_TIMESTAMP;
