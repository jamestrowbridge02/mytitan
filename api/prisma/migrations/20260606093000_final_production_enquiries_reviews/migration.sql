CREATE TYPE "BespokeEnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "MarketingReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

CREATE TABLE "BespokeAccountEnquiry" (
  "id" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "estimatedMonthlyJobs" INTEGER NOT NULL,
  "locationsCount" INTEGER NOT NULL,
  "message" TEXT NOT NULL,
  "consentToContact" BOOLEAN NOT NULL,
  "status" "BespokeEnquiryStatus" NOT NULL DEFAULT 'NEW',
  "source" TEXT NOT NULL DEFAULT 'marketing',
  "requestFingerprint" TEXT,
  "emailDeliveryStatus" TEXT,
  "handledByUserId" TEXT,
  "handledAt" TIMESTAMP(3),
  "internalNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BespokeAccountEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "quote" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "reviewerName" TEXT,
  "reviewerTitle" TEXT,
  "consentToPublish" BOOLEAN NOT NULL,
  "status" "MarketingReviewStatus" NOT NULL DEFAULT 'PENDING',
  "displayQuote" TEXT,
  "displayBusinessName" TEXT,
  "displayReviewerName" TEXT,
  "displayReviewerTitle" TEXT,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "moderationNote" TEXT,
  "moderatedByUserId" TEXT,
  "moderatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BespokeAccountEnquiry_status_createdAt_idx" ON "BespokeAccountEnquiry"("status", "createdAt");
CREATE INDEX "BespokeAccountEnquiry_email_createdAt_idx" ON "BespokeAccountEnquiry"("email", "createdAt");
CREATE INDEX "MarketingReview_tenantId_createdAt_idx" ON "MarketingReview"("tenantId", "createdAt");
CREATE INDEX "MarketingReview_status_pinned_sortOrder_createdAt_idx" ON "MarketingReview"("status", "pinned", "sortOrder", "createdAt");

ALTER TABLE "MarketingReview"
  ADD CONSTRAINT "MarketingReview_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingReview"
  ADD CONSTRAINT "MarketingReview_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
