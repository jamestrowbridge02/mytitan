CREATE TABLE "PlatformSafeErrorLog" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "sanitizedDetailsJson" JSONB,
  "sourceKind" TEXT,
  "sourceRef" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "status" TEXT NOT NULL DEFAULT 'open',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "clearable" BOOLEAN NOT NULL DEFAULT true,
  "validationOnly" BOOLEAN NOT NULL DEFAULT false,
  "auditProtected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformSafeErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformSafeErrorLog_category_status_lastSeenAt_idx"
ON "PlatformSafeErrorLog"("category", "status", "lastSeenAt");

CREATE INDEX "PlatformSafeErrorLog_status_clearable_lastSeenAt_idx"
ON "PlatformSafeErrorLog"("status", "clearable", "lastSeenAt");

CREATE INDEX "PlatformSafeErrorLog_validationOnly_status_lastSeenAt_idx"
ON "PlatformSafeErrorLog"("validationOnly", "status", "lastSeenAt");
