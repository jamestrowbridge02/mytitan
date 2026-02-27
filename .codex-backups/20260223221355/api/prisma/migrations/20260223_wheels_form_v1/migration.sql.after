-- Wheels Job Form v1 additive schema
DO $$ BEGIN
  CREATE TYPE "JobAssetKind" AS ENUM ('BEFORE','AFTER','TORQUE','SIGN_TECH','SIGN_CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "tradeCode" TEXT,
  ADD COLUMN IF NOT EXISTS "jobType" TEXT,
  ADD COLUMN IF NOT EXISTS "formData" JSONB,
  ADD COLUMN IF NOT EXISTS "whatsappCompletionLink" TEXT;

CREATE INDEX IF NOT EXISTS "Job_companyId_jobType_idx" ON "Job"("companyId", "jobType");
CREATE INDEX IF NOT EXISTS "Job_companyId_tradeCode_idx" ON "Job"("companyId", "tradeCode");

CREATE TABLE IF NOT EXISTS "FormTemplate" (
  "id" TEXT PRIMARY KEY,
  "tradeCode" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormTemplate_tradeCode_version_key" ON "FormTemplate"("tradeCode", "version");
CREATE INDEX IF NOT EXISTS "FormTemplate_tradeCode_isDefault_idx" ON "FormTemplate"("tradeCode", "isDefault");

CREATE TABLE IF NOT EXISTS "FormField" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "optionsJson" JSONB,
  "fieldOrder" INTEGER NOT NULL,
  "group" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "FormField_templateId_key_key" ON "FormField"("templateId", "key");
CREATE INDEX IF NOT EXISTS "FormField_templateId_fieldOrder_idx" ON "FormField"("templateId", "fieldOrder");
CREATE INDEX IF NOT EXISTS "FormField_group_idx" ON "FormField"("group");

DO $$ BEGIN
  ALTER TABLE "FormField"
  ADD CONSTRAINT "FormField_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "JobAsset" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "kind" "JobAssetKind" NOT NULL,
  "url" TEXT NOT NULL,
  "mime" TEXT,
  "bytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "JobAsset_jobId_kind_idx" ON "JobAsset"("jobId", "kind");

DO $$ BEGIN
  ALTER TABLE "JobAsset"
  ADD CONSTRAINT "JobAsset_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "JobPdf" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL UNIQUE,
  "url" TEXT NOT NULL,
  "contentBase64" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "JobPdf"
  ADD CONSTRAINT "JobPdf_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
