-- CreateEnum
CREATE TYPE "TechnicianCapacityExceptionType" AS ENUM ('UNAVAILABLE', 'REDUCED_CAPACITY', 'OVERTIME');

-- CreateTable
CREATE TABLE "TechnicianAvailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacityMinutes" INTEGER NOT NULL,
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianCapacityException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "TechnicianCapacityExceptionType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacityMinutes" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianCapacityException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicianAvailability_tenantId_technicianId_date_idx" ON "TechnicianAvailability"("tenantId", "technicianId", "date");

-- CreateIndex
CREATE INDEX "TechnicianAvailability_tenantId_date_idx" ON "TechnicianAvailability"("tenantId", "date");

-- CreateIndex
CREATE INDEX "TechnicianCapacityException_tenantId_technicianId_date_idx" ON "TechnicianCapacityException"("tenantId", "technicianId", "date");

-- CreateIndex
CREATE INDEX "TechnicianCapacityException_tenantId_date_type_idx" ON "TechnicianCapacityException"("tenantId", "date", "type");

-- AddForeignKey
ALTER TABLE "TechnicianAvailability" ADD CONSTRAINT "TechnicianAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAvailability" ADD CONSTRAINT "TechnicianAvailability_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianCapacityException" ADD CONSTRAINT "TechnicianCapacityException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianCapacityException" ADD CONSTRAINT "TechnicianCapacityException_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
