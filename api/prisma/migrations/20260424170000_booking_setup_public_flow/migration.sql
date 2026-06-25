ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "pricingSnapshotJson" JSONB,
  ADD COLUMN IF NOT EXISTS "paymentStateJson" JSONB;

ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "bookingConfigJson" JSONB;
