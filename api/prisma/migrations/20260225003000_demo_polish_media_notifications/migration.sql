--  polish + media/signature + notifications

ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "JobMedia"
ADD COLUMN IF NOT EXISTS "mime" TEXT,
ADD COLUMN IF NOT EXISTS "bytes" INTEGER,
ADD COLUMN IF NOT EXISTS "fileName" TEXT;

CREATE TABLE IF NOT EXISTS "JobSignature" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "signerType" TEXT NOT NULL,
  "signerName" TEXT,
  "dataUrl" TEXT NOT NULL,
  "mime" TEXT DEFAULT 'image/png',
  "bytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobSignature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "metaJson" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobComplete" BOOLEAN NOT NULL DEFAULT true,
  "paymentReceived" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobSignature_jobId_signerType_key" ON "JobSignature"("jobId", "signerType");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

CREATE INDEX IF NOT EXISTS "Job_companyId_completedAt_idx" ON "Job"("companyId", "completedAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_createdByUserId_idx" ON "Job"("companyId", "createdByUserId");
CREATE INDEX IF NOT EXISTS "JobMedia_jobId_type_createdAt_idx" ON "JobMedia"("jobId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "JobSignature_companyId_jobId_signerType_idx" ON "JobSignature"("companyId", "jobId", "signerType");
CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_isRead_createdAt_idx" ON "Notification"("companyId", "userId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationPreference_companyId_userId_idx" ON "NotificationPreference"("companyId", "userId");

DO $$ BEGIN
  ALTER TABLE "Job"
  ADD CONSTRAINT "Job_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobSignature"
  ADD CONSTRAINT "JobSignature_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobSignature"
  ADD CONSTRAINT "JobSignature_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
