CREATE TABLE IF NOT EXISTS "DatabaseEnvironmentMarker" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "environment" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "guardVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatabaseEnvironmentMarker_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DatabaseEnvironmentMarker" ("id", "environment", "source", "guardVersion")
VALUES ('default', 'production', 'migration:20260701112000_database_environment_marker', 'production-boundary-v1')
ON CONFLICT ("id") DO NOTHING;
