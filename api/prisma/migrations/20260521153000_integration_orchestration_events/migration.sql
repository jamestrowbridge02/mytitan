-- CreateTable
CREATE TABLE "IntegrationOrchestrationEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "TenantIntegrationProvider" NOT NULL,
  "scope" "IntegrationConnectionScope" NOT NULL DEFAULT 'WORKSPACE',
  "scopeOwnerKey" TEXT NOT NULL DEFAULT 'workspace',
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "safeCategory" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "message" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IntegrationOrchestrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationOrchestrationEvent_tenantId_createdAt_idx"
ON "IntegrationOrchestrationEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationOrchestrationEvent_tenantId_provider_scope_createdAt_idx"
ON "IntegrationOrchestrationEvent"("tenantId", "provider", "scope", "createdAt");
