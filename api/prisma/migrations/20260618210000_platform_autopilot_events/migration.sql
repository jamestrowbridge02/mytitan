CREATE TABLE "PlatformAutopilotEvent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "detail" TEXT,
  "owner" TEXT,
  "impact" TEXT,
  "nextAction" TEXT,
  "safeFixAction" TEXT,
  "affectedRef" TEXT,
  "metadataJson" JSONB,
  "actorUserId" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformAutopilotEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAutopilotEvent_kind_key_checkedAt_idx"
ON "PlatformAutopilotEvent"("kind", "key", "checkedAt");

CREATE INDEX "PlatformAutopilotEvent_status_checkedAt_idx"
ON "PlatformAutopilotEvent"("status", "checkedAt");

CREATE INDEX "PlatformAutopilotEvent_createdAt_idx"
ON "PlatformAutopilotEvent"("createdAt");
