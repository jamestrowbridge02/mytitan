CREATE TYPE "WorkforceAccessType" AS ENUM ('EMPLOYEE', 'CONTRACTOR', 'GUEST');

ALTER TABLE "User"
  ADD COLUMN "isStaffMember" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSchedulable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isAssignable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appearsOnRota" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appearsInBookingAssignment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workforceAccessType" "WorkforceAccessType" NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN "skillsJson" JSONB;

UPDATE "User"
SET
  "isStaffMember" = true,
  "isSchedulable" = true,
  "isAssignable" = true,
  "appearsOnRota" = true,
  "appearsInBookingAssignment" = true
WHERE "role" IN ('STAFF', 'TECHNICIAN')
  AND "isActive" = true;

UPDATE "User"
SET
  "isStaffMember" = true,
  "isAssignable" = true,
  "appearsInBookingAssignment" = true,
  "workforceAccessType" = 'CONTRACTOR'
WHERE "role" = 'EXTERNAL_OPERATOR'
  AND "isActive" = true;

CREATE INDEX "User_companyId_isActive_isSchedulable_idx" ON "User"("companyId", "isActive", "isSchedulable");
CREATE INDEX "User_companyId_isActive_isAssignable_idx" ON "User"("companyId", "isActive", "isAssignable");
