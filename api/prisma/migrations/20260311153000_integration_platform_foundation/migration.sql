DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookDeliveryStatus') THEN
    CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ApiToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secretEncrypted" TEXT,
  "secretLastFour" TEXT,
  "subscribedEventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "lastDeliveryAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT,
  "requestUrl" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "payloadJson" JSONB NOT NULL,
  "signature" TEXT,
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "attemptedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_publicId_key" ON "ApiToken"("publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "ApiToken_tenantId_createdAt_idx" ON "ApiToken"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiToken_tenantId_revokedAt_idx" ON "ApiToken"("tenantId", "revokedAt");

CREATE INDEX IF NOT EXISTS "WebhookEndpoint_tenantId_active_createdAt_idx" ON "WebhookEndpoint"("tenantId", "active", "createdAt");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_tenantId_createdAt_idx" ON "WebhookDelivery"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_tenantId_eventType_createdAt_idx" ON "WebhookDelivery"("tenantId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ApiToken_tenantId_fkey'
      AND table_name = 'ApiToken'
  ) THEN
    ALTER TABLE "ApiToken"
      ADD CONSTRAINT "ApiToken_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'WebhookEndpoint_tenantId_fkey'
      AND table_name = 'WebhookEndpoint'
  ) THEN
    ALTER TABLE "WebhookEndpoint"
      ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'WebhookDelivery_tenantId_fkey'
      AND table_name = 'WebhookDelivery'
  ) THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'WebhookDelivery_endpointId_fkey'
      AND table_name = 'WebhookDelivery'
  ) THEN
    ALTER TABLE "WebhookDelivery"
      ADD CONSTRAINT "WebhookDelivery_endpointId_fkey"
      FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
