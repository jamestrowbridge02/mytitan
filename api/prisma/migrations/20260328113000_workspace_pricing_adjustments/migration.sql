ALTER TABLE "TenantSetting"
ADD COLUMN "pricingAdjustmentJson" JSONB,
ADD COLUMN "pricingAdjustmentConsumedAt" TIMESTAMP(3);
