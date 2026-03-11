DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentArtifactEntityType') THEN
    CREATE TYPE "DocumentArtifactEntityType" AS ENUM ('JOB', 'CUSTOMER');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentArtifactKind') THEN
    CREATE TYPE "DocumentArtifactKind" AS ENUM ('INVOICE', 'RECEIPT', 'JOB_ATTACHMENT', 'CUSTOMER_ATTACHMENT', 'PORTAL_DOCUMENT');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "DocumentArtifact" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" "DocumentArtifactEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "kind" "DocumentArtifactKind" NOT NULL,
  "label" TEXT NOT NULL,
  "fileName" TEXT,
  "storagePath" TEXT,
  "externalUrl" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "portalVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DocumentArtifact_tenantId_fkey'
  ) THEN
    ALTER TABLE "DocumentArtifact"
      ADD CONSTRAINT "DocumentArtifact_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "DocumentArtifact_tenantId_entityType_entityId_createdAt_idx"
  ON "DocumentArtifact"("tenantId", "entityType", "entityId", "createdAt");

CREATE INDEX IF NOT EXISTS "DocumentArtifact_tenantId_entityType_entityId_kind_idx"
  ON "DocumentArtifact"("tenantId", "entityType", "entityId", "kind");

CREATE INDEX IF NOT EXISTS "DocumentArtifact_tenantId_portalVisible_createdAt_idx"
  ON "DocumentArtifact"("tenantId", "portalVisible", "createdAt");
