ALTER TABLE "TenantJobAllowanceOverride"
ADD COLUMN "recurringExtraAllowance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformSupportSession"
ADD COLUMN "viewRole" TEXT NOT NULL DEFAULT 'owner',
ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'read_only';

ALTER TABLE "TenantSubscription"
ADD COLUMN "trialPausedAt" TIMESTAMP(3),
ADD COLUMN "trialPausedRemainingSeconds" INTEGER;
