CREATE TABLE "TechScheduleSetting" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "technicianId" text NOT NULL,
  "weeklyJson" jsonb NOT NULL,
  "timezone" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

ALTER TABLE "TechScheduleSetting"
  ADD CONSTRAINT "TechScheduleSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

ALTER TABLE "TechScheduleSetting"
  ADD CONSTRAINT "TechScheduleSetting_companyId_technicianId_key" UNIQUE ("companyId", "technicianId");

CREATE INDEX "TechScheduleSetting_companyId_technicianId_index" ON "TechScheduleSetting" ("companyId", "technicianId");
