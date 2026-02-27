CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT,
  "status" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "requestId" TEXT,
  "error" TEXT,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_key"
  ON "WebhookEvent" ("provider", "eventId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_receivedAt_idx"
  ON "WebhookEvent" ("provider", "receivedAt");
