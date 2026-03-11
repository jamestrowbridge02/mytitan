-- CreateEnum
CREATE TYPE "CustomerAccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerApprovalEntityType" AS ENUM ('JOB', 'BOOKING', 'DOCUMENT', 'SERVICE_PLAN');

-- CreateEnum
CREATE TYPE "CustomerApprovalKind" AS ENUM ('QUOTE_ACCEPTANCE', 'WORK_AUTHORIZATION', 'DOCUMENT_ACKNOWLEDGEMENT', 'PLAN_APPROVAL');

-- CreateEnum
CREATE TYPE "CustomerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "inviteTokenHash" TEXT,
    "inviteTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "entityType" "CustomerApprovalEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "CustomerApprovalKind" NOT NULL,
    "status" "CustomerApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_customerId_key" ON "CustomerAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_tenantId_email_key" ON "CustomerAccount"("tenantId", "email");

-- CreateIndex
CREATE INDEX "CustomerAccount_tenantId_status_idx" ON "CustomerAccount"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomerAccount_tenantId_invitedAt_idx" ON "CustomerAccount"("tenantId", "invitedAt");

-- CreateIndex
CREATE INDEX "CustomerApproval_tenantId_customerId_status_idx" ON "CustomerApproval"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerApproval_tenantId_entityType_entityId_idx" ON "CustomerApproval"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CustomerApproval_tenantId_kind_status_idx" ON "CustomerApproval"("tenantId", "kind", "status");

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerApproval" ADD CONSTRAINT "CustomerApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerApproval" ADD CONSTRAINT "CustomerApproval_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerApproval" ADD CONSTRAINT "CustomerApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
