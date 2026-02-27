ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_companyId_idempotencyKey_key"
ON "Notification"("companyId", "idempotencyKey");
