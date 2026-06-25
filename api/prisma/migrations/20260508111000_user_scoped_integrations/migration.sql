CREATE TYPE "IntegrationConnectionScope" AS ENUM ('WORKSPACE', 'USER');

ALTER TABLE "IntegrationConnection"
  ADD COLUMN "scope" "IntegrationConnectionScope" NOT NULL DEFAULT 'WORKSPACE',
  ADD COLUMN "scopeOwnerKey" TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "IntegrationAuthState"
  ADD COLUMN "scope" "IntegrationConnectionScope" NOT NULL DEFAULT 'WORKSPACE',
  ADD COLUMN "ownerUserId" TEXT;

DROP INDEX IF EXISTS "IntegrationConnection_tenantId_provider_key";

CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_scope_scopeOwnerKey_key"
  ON "IntegrationConnection"("tenantId", "provider", "scope", "scopeOwnerKey");

CREATE INDEX "IntegrationConnection_tenantId_provider_scope_ownerUserId_idx"
  ON "IntegrationConnection"("tenantId", "provider", "scope", "ownerUserId");

CREATE INDEX "IntegrationAuthState_tenantId_provider_scope_ownerUserId_idx"
  ON "IntegrationAuthState"("tenantId", "provider", "scope", "ownerUserId");

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationAuthState"
  ADD CONSTRAINT "IntegrationAuthState_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
