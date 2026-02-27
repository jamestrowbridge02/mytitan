-- Add enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingSource') THEN
    CREATE TYPE "BookingSource" AS ENUM ('INTERNAL', 'PUBLIC');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationProvider') THEN
    CREATE TYPE "IntegrationProvider" AS ENUM ('XERO', 'QBO', 'GOOGLE_CALENDAR');
  END IF;
END $$;

-- Extend BookingStatus enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BookingStatus' AND e.enumlabel = 'PENDING'
  ) THEN
    ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';
  END IF;
END $$;

-- Job portal fields
ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "declinedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentCheckoutSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentReceiptUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Job_companyId_invoiceIssuedAt_idx" ON "Job"("companyId", "invoiceIssuedAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_invoicePaidAt_idx" ON "Job"("companyId", "invoicePaidAt");

-- Booking enhancements
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "serviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "BookingSource" NOT NULL DEFAULT 'INTERNAL';

CREATE INDEX IF NOT EXISTS "Booking_companyId_startsAt_idx" ON "Booking"("companyId", "startsAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Booking_serviceId_fkey'
  ) THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Service catalog enhancements
ALTER TABLE "ServiceCatalogItem"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "capacity" INTEGER NOT NULL DEFAULT 1;

-- Tenant settings for booking public/ics
ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "bookingPublicEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bookingPublicToken" TEXT,
  ADD COLUMN IF NOT EXISTS "bookingIcsToken" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'TenantSetting_bookingPublicToken_key'
  ) THEN
    CREATE UNIQUE INDEX "TenantSetting_bookingPublicToken_key" ON "TenantSetting"("bookingPublicToken");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'TenantSetting_bookingIcsToken_key'
  ) THEN
    CREATE UNIQUE INDEX "TenantSetting_bookingIcsToken_key" ON "TenantSetting"("bookingIcsToken");
  END IF;
END $$;

-- Booking business hours
CREATE TABLE IF NOT EXISTS "BookingBusinessHour" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingBusinessHour_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingBusinessHour_tenantId_dayOfWeek_idx" ON "BookingBusinessHour"("tenantId", "dayOfWeek");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BookingBusinessHour_tenantId_fkey'
  ) THEN
    ALTER TABLE "BookingBusinessHour" ADD CONSTRAINT "BookingBusinessHour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Booking blackout dates
CREATE TABLE IF NOT EXISTS "BookingBlackoutDate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingBlackoutDate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingBlackoutDate_tenantId_date_idx" ON "BookingBlackoutDate"("tenantId", "date");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BookingBlackoutDate_tenantId_fkey'
  ) THEN
    ALTER TABLE "BookingBlackoutDate" ADD CONSTRAINT "BookingBlackoutDate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Integrations
CREATE TABLE IF NOT EXISTS "IntegrationConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT,
  "refreshTokenEncrypted" TEXT,
  "scopes" TEXT,
  "externalTenantId" TEXT,
  "realmId" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'IntegrationConnection_tenantId_provider_key'
  ) THEN
    CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_key" ON "IntegrationConnection"("tenantId", "provider");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_provider_idx" ON "IntegrationConnection"("tenantId", "provider");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IntegrationConnection_tenantId_fkey'
  ) THEN
    ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IntegrationAuthState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "state" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationAuthState_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'IntegrationAuthState_state_key'
  ) THEN
    CREATE UNIQUE INDEX "IntegrationAuthState_state_key" ON "IntegrationAuthState"("state");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IntegrationAuthState_tenantId_provider_idx" ON "IntegrationAuthState"("tenantId", "provider");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'IntegrationAuthState_tenantId_fkey'
  ) THEN
    ALTER TABLE "IntegrationAuthState" ADD CONSTRAINT "IntegrationAuthState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AI audit purpose
ALTER TABLE "AiChatAudit" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
