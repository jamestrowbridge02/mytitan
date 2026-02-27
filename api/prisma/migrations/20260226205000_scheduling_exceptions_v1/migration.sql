CREATE TABLE "TechScheduleException" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "technicianId" text NOT NULL,
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NOT NULL,
  "allDay" boolean NOT NULL DEFAULT false,
  "reason" character varying(255),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

ALTER TABLE "TechScheduleException"
  ADD CONSTRAINT "TechScheduleException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

CREATE INDEX "TechScheduleException_companyId_technicianId_startsAt_index"
  ON "TechScheduleException" ("companyId", "technicianId", "startsAt");
