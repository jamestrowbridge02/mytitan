-- Add production indexes for common tenant queries
CREATE INDEX "Job_companyId_createdAt_idx" ON "Job"("companyId", "createdAt");
CREATE INDEX "Job_companyId_status_idx" ON "Job"("companyId", "status");
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");
CREATE INDEX "UsageMeter_tenantId_createdAt_idx" ON "UsageMeter"("tenantId", "createdAt");
