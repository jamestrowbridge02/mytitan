CREATE TABLE IF NOT EXISTS "BookingServiceLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "proServiceId" TEXT,
  "serviceNameSnapshot" TEXT NOT NULL,
  "priceSnapshot" JSONB,
  "durationSnapshot" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "lineTotalCents" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingServiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingServiceLine_companyId_bookingId_sortOrder_idx" ON "BookingServiceLine"("companyId", "bookingId", "sortOrder");
CREATE INDEX IF NOT EXISTS "BookingServiceLine_companyId_proServiceId_idx" ON "BookingServiceLine"("companyId", "proServiceId");

ALTER TABLE "BookingServiceLine" ADD CONSTRAINT "BookingServiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingServiceLine" ADD CONSTRAINT "BookingServiceLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingServiceLine" ADD CONSTRAINT "BookingServiceLine_proServiceId_fkey" FOREIGN KEY ("proServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
