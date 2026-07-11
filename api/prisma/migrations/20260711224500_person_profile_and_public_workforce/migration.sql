ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "seniority" TEXT,
  ADD COLUMN IF NOT EXISTS "employeeReference" TEXT,
  ADD COLUMN IF NOT EXISTS "permissionProfile" TEXT,
  ADD COLUMN IF NOT EXISTS "isPublicBookable" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET
  "jobTitle" = CASE
    WHEN "role" = 'TECHNICIAN' AND "jobTitle" IS NULL THEN 'Technician'
    WHEN "role" = 'FINANCE' AND "jobTitle" IS NULL THEN 'Accounts'
    WHEN "role" = 'ADMIN' AND "jobTitle" IS NULL THEN 'Administrator'
    ELSE "jobTitle"
  END,
  "department" = CASE
    WHEN "role" = 'TECHNICIAN' AND "department" IS NULL THEN 'Operations'
    WHEN "role" = 'FINANCE' AND "department" IS NULL THEN 'Accounts'
    WHEN "role" = 'DISPATCHER' AND "department" IS NULL THEN 'Operations'
    ELSE "department"
  END,
  "permissionProfile" = CASE
    WHEN "permissionProfile" IS NOT NULL THEN "permissionProfile"
    WHEN "role" = 'OWNER' THEN 'Owner'
    WHEN "role" = 'ADMIN' THEN 'Administrator'
    WHEN "role" = 'DISPATCHER' THEN 'Dispatcher'
    WHEN "role" = 'TECHNICIAN' THEN 'Field worker'
    WHEN "role" = 'FINANCE' THEN 'Finance'
    WHEN "role" = 'EXTERNAL_OPERATOR' THEN 'Subcontractor'
    WHEN "role" = 'VIEWER' OR "role" = 'READ_ONLY' THEN 'Read only'
    ELSE 'Custom'
  END,
  "isPublicBookable" = CASE
    WHEN "isAssignable" = true AND "appearsInBookingAssignment" = true AND "role" IN ('STAFF', 'TECHNICIAN') THEN true
    ELSE "isPublicBookable"
  END;

CREATE INDEX IF NOT EXISTS "User_companyId_department_idx" ON "User"("companyId", "department");
CREATE INDEX IF NOT EXISTS "User_companyId_jobTitle_idx" ON "User"("companyId", "jobTitle");
CREATE INDEX IF NOT EXISTS "User_companyId_isPublicBookable_idx" ON "User"("companyId", "isPublicBookable");
