CREATE TABLE IF NOT EXISTS "PlatformSupportSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platformUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSupportSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformSupportSession_tenantId_platformUserId_expiresAt_idx"
ON "PlatformSupportSession"("tenantId", "platformUserId", "expiresAt");

CREATE INDEX IF NOT EXISTS "PlatformSupportSession_platformUserId_endedAt_expiresAt_idx"
ON "PlatformSupportSession"("platformUserId", "endedAt", "expiresAt");

DO $$
BEGIN
  ALTER TABLE "PlatformSupportSession"
  ADD CONSTRAINT "PlatformSupportSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlatformSupportSession"
  ADD CONSTRAINT "PlatformSupportSession_platformUserId_fkey"
  FOREIGN KEY ("platformUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
