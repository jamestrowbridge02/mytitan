-- AlterEnum
BEGIN;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING ("role"::text);
DROP TYPE IF EXISTS "UserRole_new";
CREATE TYPE "UserRole_new" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY');
UPDATE "User" SET "role" = 'STAFF' WHERE "role" IN ('MANAGER', 'DISPATCHER', 'TECHNICIAN', 'VIEWER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByName" TEXT,
ADD COLUMN     "invoicePdfUrl" TEXT,
ADD COLUMN     "paymentLinkUrl" TEXT,
ADD COLUMN     "signatureDataUrl" TEXT,
ADD COLUMN     "signatureName" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantSetting" ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UsageMeter" ADD COLUMN     "jobsCreatedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageBytesUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ALTER COLUMN "role" SET DEFAULT 'STAFF';

-- CreateTable
CREATE TABLE "InviteToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicJobToken" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicJobToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");

-- CreateIndex
CREATE INDEX "InviteToken_tenantId_email_idx" ON "InviteToken"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PublicJobToken_token_key" ON "PublicJobToken"("token");

-- AddForeignKey
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicJobToken" ADD CONSTRAINT "PublicJobToken_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
