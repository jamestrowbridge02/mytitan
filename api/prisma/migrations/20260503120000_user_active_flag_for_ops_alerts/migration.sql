ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "User_companyId_role_isActive_idx" ON "User"("companyId", "role", "isActive");
