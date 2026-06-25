CREATE TABLE "WebsiteVisitEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "surface" TEXT NOT NULL,
  "pathSanitized" TEXT NOT NULL,
  "anonymousSessionHash" TEXT,
  "source" TEXT,
  "userAgentFamily" TEXT,
  "dayKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebsiteVisitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteVisitEvent_createdAt_idx" ON "WebsiteVisitEvent"("createdAt");
CREATE INDEX "WebsiteVisitEvent_tenantId_createdAt_idx" ON "WebsiteVisitEvent"("tenantId", "createdAt");
CREATE INDEX "WebsiteVisitEvent_surface_createdAt_idx" ON "WebsiteVisitEvent"("surface", "createdAt");
CREATE INDEX "WebsiteVisitEvent_dayKey_surface_idx" ON "WebsiteVisitEvent"("dayKey", "surface");

ALTER TABLE "WebsiteVisitEvent"
  ADD CONSTRAINT "WebsiteVisitEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
