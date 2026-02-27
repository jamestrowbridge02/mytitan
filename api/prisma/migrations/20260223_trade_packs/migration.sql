DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TemplatePresetType') THEN
    CREATE TYPE "TemplatePresetType" AS ENUM (
      'CATALOG_ITEM',
      'PRICING_PRESET',
      'CHECKLIST',
      'EMAIL_TEMPLATE',
      'PDF_TEMPLATE',
      'BOOKING_DEFAULTS',
      'PORTAL_COPY'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TradePack" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradePack_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "TradePackInstall" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "packCode" TEXT NOT NULL,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "installedByUserId" TEXT,
  "configJson" JSONB,
  CONSTRAINT "TradePackInstall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemplatePreset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "packCode" TEXT NOT NULL,
  "type" "TemplatePresetType" NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dataJson" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplatePreset_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'TradePackInstall_tenantId_packCode_key'
  ) THEN
    CREATE UNIQUE INDEX "TradePackInstall_tenantId_packCode_key"
      ON "TradePackInstall"("tenantId", "packCode");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TradePackInstall_tenantId_packCode_idx"
  ON "TradePackInstall"("tenantId", "packCode");
CREATE INDEX IF NOT EXISTS "TradePackInstall_tenantId_installedAt_idx"
  ON "TradePackInstall"("tenantId", "installedAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'TemplatePreset_tenantId_packCode_type_key_key'
  ) THEN
    CREATE UNIQUE INDEX "TemplatePreset_tenantId_packCode_type_key_key"
      ON "TemplatePreset"("tenantId", "packCode", "type", "key");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TemplatePreset_tenantId_packCode_idx"
  ON "TemplatePreset"("tenantId", "packCode");
CREATE INDEX IF NOT EXISTS "TemplatePreset_tenantId_type_isActive_idx"
  ON "TemplatePreset"("tenantId", "type", "isActive");
CREATE INDEX IF NOT EXISTS "TemplatePreset_tenantId_updatedAt_idx"
  ON "TemplatePreset"("tenantId", "updatedAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TradePackInstall_tenantId_fkey'
  ) THEN
    ALTER TABLE "TradePackInstall"
      ADD CONSTRAINT "TradePackInstall_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TradePackInstall_packCode_fkey'
  ) THEN
    ALTER TABLE "TradePackInstall"
      ADD CONSTRAINT "TradePackInstall_packCode_fkey"
      FOREIGN KEY ("packCode") REFERENCES "TradePack"("code")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TemplatePreset_tenantId_fkey'
  ) THEN
    ALTER TABLE "TemplatePreset"
      ADD CONSTRAINT "TemplatePreset_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TemplatePreset_packCode_fkey'
  ) THEN
    ALTER TABLE "TemplatePreset"
      ADD CONSTRAINT "TemplatePreset_packCode_fkey"
      FOREIGN KEY ("packCode") REFERENCES "TradePack"("code")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
