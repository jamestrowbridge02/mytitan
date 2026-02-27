-- Ops V2 Core: command centre, booking pro, crm pro

ALTER TABLE "TradeAccount"
ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3);

ALTER TABLE "Booking"
ADD COLUMN IF NOT EXISTS "proServiceId" TEXT;

CREATE TABLE IF NOT EXISTS "JobActivity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "message" TEXT,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobTag" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SavedBoardView" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "viewType" TEXT NOT NULL DEFAULT 'kanban',
  "filtersJson" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "defaultLocationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedBoardView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobReminder" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'in_app',
  "note" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Service" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "bufferBefore" INTEGER NOT NULL DEFAULT 0,
  "bufferAfter" INTEGER NOT NULL DEFAULT 0,
  "depositCents" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffAvailability" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlackoutDate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BookingQuestion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT,
  "label" TEXT NOT NULL,
  "questionKey" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "optionsJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BookingAnswer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "valueText" TEXT,
  "valueJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerTag" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerSegment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rulesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CRMNote" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "bodyJson" JSONB NOT NULL,
  "attachmentsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CRMNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CRMTask" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assigneeUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CRMTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobTag_companyId_name_key" ON "JobTag"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffAvailability_locationId_userId_weekday_key" ON "StaffAvailability"("locationId", "userId", "weekday");
CREATE UNIQUE INDEX IF NOT EXISTS "BookingQuestion_companyId_questionKey_key" ON "BookingQuestion"("companyId", "questionKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTag_companyId_tradeAccountId_label_key" ON "CustomerTag"("companyId", "tradeAccountId", "label");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSegment_companyId_name_key" ON "CustomerSegment"("companyId", "name");

CREATE INDEX IF NOT EXISTS "JobActivity_companyId_jobId_createdAt_idx" ON "JobActivity"("companyId", "jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobActivity_companyId_createdAt_idx" ON "JobActivity"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobTag_companyId_createdAt_idx" ON "JobTag"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "SavedBoardView_companyId_userId_createdAt_idx" ON "SavedBoardView"("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SavedBoardView_companyId_userId_isDefault_idx" ON "SavedBoardView"("companyId", "userId", "isDefault");
CREATE INDEX IF NOT EXISTS "JobReminder_companyId_remindAt_idx" ON "JobReminder"("companyId", "remindAt");
CREATE INDEX IF NOT EXISTS "JobReminder_companyId_jobId_remindAt_idx" ON "JobReminder"("companyId", "jobId", "remindAt");
CREATE INDEX IF NOT EXISTS "Service_companyId_locationId_isActive_idx" ON "Service"("companyId", "locationId", "isActive");
CREATE INDEX IF NOT EXISTS "Service_companyId_createdAt_idx" ON "Service"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "StaffAvailability_companyId_locationId_idx" ON "StaffAvailability"("companyId", "locationId");
CREATE INDEX IF NOT EXISTS "StaffAvailability_companyId_userId_idx" ON "StaffAvailability"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "BlackoutDate_companyId_locationId_date_idx" ON "BlackoutDate"("companyId", "locationId", "date");
CREATE INDEX IF NOT EXISTS "BookingQuestion_companyId_locationId_isActive_idx" ON "BookingQuestion"("companyId", "locationId", "isActive");
CREATE INDEX IF NOT EXISTS "BookingAnswer_companyId_bookingId_idx" ON "BookingAnswer"("companyId", "bookingId");
CREATE INDEX IF NOT EXISTS "BookingAnswer_companyId_questionId_idx" ON "BookingAnswer"("companyId", "questionId");
CREATE INDEX IF NOT EXISTS "CustomerTag_companyId_tradeAccountId_createdAt_idx" ON "CustomerTag"("companyId", "tradeAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerSegment_companyId_createdAt_idx" ON "CustomerSegment"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "CRMNote_companyId_tradeAccountId_createdAt_idx" ON "CRMNote"("companyId", "tradeAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "CRMTask_companyId_tradeAccountId_status_dueAt_idx" ON "CRMTask"("companyId", "tradeAccountId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "CRMTask_companyId_assigneeUserId_status_idx" ON "CRMTask"("companyId", "assigneeUserId", "status");
CREATE INDEX IF NOT EXISTS "Booking_companyId_locationId_startsAt_endsAt_idx" ON "Booking"("companyId", "locationId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_status_invoiceDueAt_locationId_idx" ON "Job"("companyId", "status", "invoiceDueAt", "locationId");

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_proServiceId_fkey"
FOREIGN KEY ("proServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobActivity"
ADD CONSTRAINT "JobActivity_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity"
ADD CONSTRAINT "JobActivity_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobActivity"
ADD CONSTRAINT "JobActivity_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobTag"
ADD CONSTRAINT "JobTag_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedBoardView"
ADD CONSTRAINT "SavedBoardView_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedBoardView"
ADD CONSTRAINT "SavedBoardView_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedBoardView"
ADD CONSTRAINT "SavedBoardView_defaultLocationId_fkey"
FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JobReminder"
ADD CONSTRAINT "JobReminder_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobReminder"
ADD CONSTRAINT "JobReminder_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service"
ADD CONSTRAINT "Service_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service"
ADD CONSTRAINT "Service_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffAvailability"
ADD CONSTRAINT "StaffAvailability_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAvailability"
ADD CONSTRAINT "StaffAvailability_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAvailability"
ADD CONSTRAINT "StaffAvailability_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlackoutDate"
ADD CONSTRAINT "BlackoutDate_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlackoutDate"
ADD CONSTRAINT "BlackoutDate_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingQuestion"
ADD CONSTRAINT "BookingQuestion_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingQuestion"
ADD CONSTRAINT "BookingQuestion_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingAnswer"
ADD CONSTRAINT "BookingAnswer_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingAnswer"
ADD CONSTRAINT "BookingAnswer_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingAnswer"
ADD CONSTRAINT "BookingAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "BookingQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTag"
ADD CONSTRAINT "CustomerTag_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTag"
ADD CONSTRAINT "CustomerTag_tradeAccountId_fkey"
FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSegment"
ADD CONSTRAINT "CustomerSegment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CRMNote"
ADD CONSTRAINT "CRMNote_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CRMNote"
ADD CONSTRAINT "CRMNote_tradeAccountId_fkey"
FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CRMNote"
ADD CONSTRAINT "CRMNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CRMTask"
ADD CONSTRAINT "CRMTask_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CRMTask"
ADD CONSTRAINT "CRMTask_tradeAccountId_fkey"
FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CRMTask"
ADD CONSTRAINT "CRMTask_assigneeUserId_fkey"
FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
