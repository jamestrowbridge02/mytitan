DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NextActionType') THEN
    CREATE TYPE "NextActionType" AS ENUM ('CALL','EMAIL','WHATSAPP','FOLLOW_UP','MEETING');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TradeAccount"
  ADD COLUMN IF NOT EXISTS "nextActionType" "NextActionType",
  ADD COLUMN IF NOT EXISTS "nextActionDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextActionUserId" TEXT;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "tradeAccountId" TEXT;

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "tradeAccountId" TEXT;

CREATE TABLE IF NOT EXISTS "TradeAccountNote" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "mentionHandles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "attachmentsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "JobDraft" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trade" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CrmDraft" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tradeAccountId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobDraft_company_user_trade_key"
  ON "JobDraft"("companyId", "userId", "trade");
CREATE INDEX IF NOT EXISTS "JobDraft_company_updatedAt_idx"
  ON "JobDraft"("companyId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CrmDraft_company_updatedAt_idx"
  ON "CrmDraft"("companyId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CrmDraft_company_user_account_idx"
  ON "CrmDraft"("companyId", "userId", "tradeAccountId");
CREATE INDEX IF NOT EXISTS "TradeAccountNote_company_account_created_idx"
  ON "TradeAccountNote"("companyId", "tradeAccountId", "createdAt");

CREATE INDEX IF NOT EXISTS "TradeAccount_company_createdAt_idx"
  ON "TradeAccount"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "TradeAccount_company_status_idx"
  ON "TradeAccount"("companyId", "status");
CREATE INDEX IF NOT EXISTS "Job_company_tradeAccount_createdAt_idx"
  ON "Job"("companyId", "tradeAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "Booking_company_tradeAccount_startsAt_idx"
  ON "Booking"("companyId", "tradeAccountId", "startsAt");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_company_user_created_idx"
  ON "PasswordResetToken"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_company_user_created_idx"
  ON "EmailVerificationToken"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx"
  ON "EmailVerificationToken"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TradeAccountNote_companyId_fkey') THEN
    ALTER TABLE "TradeAccountNote" ADD CONSTRAINT "TradeAccountNote_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TradeAccountNote_tradeAccountId_fkey') THEN
    ALTER TABLE "TradeAccountNote" ADD CONSTRAINT "TradeAccountNote_tradeAccountId_fkey"
      FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_tradeAccountId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_tradeAccountId_fkey"
      FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_tradeAccountId_fkey') THEN
    ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tradeAccountId_fkey"
      FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDraft_companyId_fkey') THEN
    ALTER TABLE "JobDraft" ADD CONSTRAINT "JobDraft_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobDraft_userId_fkey') THEN
    ALTER TABLE "JobDraft" ADD CONSTRAINT "JobDraft_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmDraft_companyId_fkey') THEN
    ALTER TABLE "CrmDraft" ADD CONSTRAINT "CrmDraft_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmDraft_userId_fkey') THEN
    ALTER TABLE "CrmDraft" ADD CONSTRAINT "CrmDraft_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_companyId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerificationToken_companyId_fkey') THEN
    ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerificationToken_userId_fkey') THEN
    ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
