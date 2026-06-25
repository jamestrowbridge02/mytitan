ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "conversionAt" TIMESTAMP(3);

DO $$
BEGIN
  CREATE TYPE "SubscriptionConversionSource" AS ENUM ('lifecycle_email', 'manual', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TenantSubscription"
ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "conversionSource" "SubscriptionConversionSource";
