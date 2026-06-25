ALTER TABLE "TenantSetting"
  ADD COLUMN "tenantCountry" TEXT NOT NULL DEFAULT 'GB',
  ADD COLUMN "invoiceCurrency" TEXT,
  ADD COLUMN "publicBookingLocale" TEXT,
  ADD COLUMN "phoneCountryCode" TEXT,
  ADD COLUMN "taxLabel" TEXT,
  ADD COLUMN "invoiceLegalFooter" TEXT;
