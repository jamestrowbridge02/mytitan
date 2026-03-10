-- CreateTable
CREATE TABLE "AutomationSuggestionState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suggestionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "appliedRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSuggestionState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationSuggestionState_tenantId_suggestionKey_key" ON "AutomationSuggestionState"("tenantId", "suggestionKey");

-- CreateIndex
CREATE INDEX "AutomationSuggestionState_tenantId_status_updatedAt_idx" ON "AutomationSuggestionState"("tenantId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "AutomationSuggestionState" ADD CONSTRAINT "AutomationSuggestionState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
