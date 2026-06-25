-- CreateTable
CREATE TABLE "JobCompletionQuickLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCompletionQuickLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCompletionQuickLink_tokenHash_key" ON "JobCompletionQuickLink"("tokenHash");

-- CreateIndex
CREATE INDEX "JobCompletionQuickLink_tenantId_jobId_createdAt_idx" ON "JobCompletionQuickLink"("tenantId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobCompletionQuickLink_tenantId_revokedAt_expiresAt_idx" ON "JobCompletionQuickLink"("tenantId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "JobCompletionQuickLink_tenantId_expiresAt_idx" ON "JobCompletionQuickLink"("tenantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "JobCompletionQuickLink" ADD CONSTRAINT "JobCompletionQuickLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCompletionQuickLink" ADD CONSTRAINT "JobCompletionQuickLink_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCompletionQuickLink" ADD CONSTRAINT "JobCompletionQuickLink_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
