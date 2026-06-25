-- Normalized CRM foundation for multi-location and multi-contact trade accounts.

CREATE TYPE "TradeAccountLocationKind" AS ENUM ('BUSINESS', 'BILLING', 'SERVICE', 'OTHER');
CREATE TYPE "TradeAccountContactPreferenceEvent" AS ENUM ('JOB_COMPLETION', 'INVOICE', 'UPDATE_CALL', 'GENERAL_NOTIFICATION');
CREATE TYPE "TradeAccountContactPreferenceChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PHONE');

CREATE TABLE "TradeAccountLocation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "linkedLocationId" TEXT,
  "name" TEXT NOT NULL,
  "kind" "TradeAccountLocationKind" NOT NULL DEFAULT 'BUSINESS',
  "legacyAliasKey" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "postcode" TEXT,
  "country" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isBilling" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeAccountLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeAccountContact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tradeAccountId" TEXT NOT NULL,
  "tradeAccountLocationId" TEXT,
  "legacyAliasKey" TEXT,
  "name" TEXT NOT NULL,
  "roleLabel" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isBilling" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeAccountContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeAccountContactPreference" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "event" "TradeAccountContactPreferenceEvent" NOT NULL,
  "channel" "TradeAccountContactPreferenceChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeAccountContactPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradeAccountLocation_tradeAccountId_legacyAliasKey_key" ON "TradeAccountLocation"("tradeAccountId", "legacyAliasKey");
CREATE INDEX "TradeAccountLocation_companyId_tradeAccountId_createdAt_idx" ON "TradeAccountLocation"("companyId", "tradeAccountId", "createdAt");
CREATE INDEX "TradeAccountLocation_companyId_linkedLocationId_idx" ON "TradeAccountLocation"("companyId", "linkedLocationId");

CREATE UNIQUE INDEX "TradeAccountContact_tradeAccountId_legacyAliasKey_key" ON "TradeAccountContact"("tradeAccountId", "legacyAliasKey");
CREATE INDEX "TradeAccountContact_companyId_tradeAccountId_createdAt_idx" ON "TradeAccountContact"("companyId", "tradeAccountId", "createdAt");
CREATE INDEX "TradeAccountContact_companyId_tradeAccountLocationId_idx" ON "TradeAccountContact"("companyId", "tradeAccountLocationId");

CREATE UNIQUE INDEX "TradeAccountContactPreference_contactId_event_channel_key" ON "TradeAccountContactPreference"("contactId", "event", "channel");
CREATE INDEX "TradeAccountContactPreference_companyId_event_channel_idx" ON "TradeAccountContactPreference"("companyId", "event", "channel");

ALTER TABLE "TradeAccountLocation"
  ADD CONSTRAINT "TradeAccountLocation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAccountLocation"
  ADD CONSTRAINT "TradeAccountLocation_tradeAccountId_fkey"
  FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAccountLocation"
  ADD CONSTRAINT "TradeAccountLocation_linkedLocationId_fkey"
  FOREIGN KEY ("linkedLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeAccountContact"
  ADD CONSTRAINT "TradeAccountContact_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAccountContact"
  ADD CONSTRAINT "TradeAccountContact_tradeAccountId_fkey"
  FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAccountContact"
  ADD CONSTRAINT "TradeAccountContact_tradeAccountLocationId_fkey"
  FOREIGN KEY ("tradeAccountLocationId") REFERENCES "TradeAccountLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TradeAccountContactPreference"
  ADD CONSTRAINT "TradeAccountContactPreference_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAccountContactPreference"
  ADD CONSTRAINT "TradeAccountContactPreference_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "TradeAccountContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH business_locations AS (
  INSERT INTO "TradeAccountLocation" (
    "id",
    "companyId",
    "tradeAccountId",
    "name",
    "kind",
    "legacyAliasKey",
    "addressLine1",
    "addressLine2",
    "city",
    "postcode",
    "country",
    "isPrimary",
    "isBilling"
  )
  SELECT
    'tal_' || substr(md5(random()::text || clock_timestamp()::text || ta.id), 1, 24),
    ta."companyId",
    ta."id",
    CASE
      WHEN coalesce(trim(ta."businessAddressLine1"), '') <> '' THEN coalesce(nullif(trim(ta."name"), ''), 'Business') || ' head office'
      ELSE coalesce(nullif(trim(ta."name"), ''), 'Business')
    END,
    'BUSINESS'::"TradeAccountLocationKind",
    'PRIMARY_BUSINESS',
    nullif(trim(ta."businessAddressLine1"), ''),
    nullif(trim(ta."businessAddressLine2"), ''),
    nullif(trim(ta."businessCity"), ''),
    nullif(trim(ta."businessPostcode"), ''),
    nullif(trim(ta."businessCountry"), ''),
    true,
    false
  FROM "TradeAccount" ta
),
billing_locations AS (
  INSERT INTO "TradeAccountLocation" (
    "id",
    "companyId",
    "tradeAccountId",
    "name",
    "kind",
    "legacyAliasKey",
    "addressLine1",
    "addressLine2",
    "city",
    "postcode",
    "country",
    "isPrimary",
    "isBilling"
  )
  SELECT
    'tal_' || substr(md5(random()::text || clock_timestamp()::text || ta.id || 'billing'), 1, 24),
    ta."companyId",
    ta."id",
    coalesce(nullif(trim(ta."name"), ''), 'Business') || ' billing',
    'BILLING'::"TradeAccountLocationKind",
    'BILLING_LOCATION',
    nullif(trim(ta."billingAddressLine1"), ''),
    nullif(trim(ta."billingAddressLine2"), ''),
    nullif(trim(ta."billingCity"), ''),
    nullif(trim(ta."billingPostcode"), ''),
    nullif(trim(ta."billingCountry"), ''),
    false,
    true
  FROM "TradeAccount" ta
  WHERE
    coalesce(trim(ta."billingAddressLine1"), '') <> ''
    OR coalesce(trim(ta."billingAddressLine2"), '') <> ''
    OR coalesce(trim(ta."billingCity"), '') <> ''
    OR coalesce(trim(ta."billingPostcode"), '') <> ''
    OR coalesce(trim(ta."billingCountry"), '') <> ''
    OR coalesce(trim(ta."billingContactName"), '') <> ''
    OR coalesce(trim(ta."billingEmail"), '') <> ''
    OR coalesce(trim(ta."billingPhone"), '') <> ''
    OR coalesce(trim(ta."billingMobile"), '') <> ''
),
primary_contacts AS (
  INSERT INTO "TradeAccountContact" (
    "id",
    "companyId",
    "tradeAccountId",
    "tradeAccountLocationId",
    "legacyAliasKey",
    "name",
    "roleLabel",
    "email",
    "phone",
    "mobile",
    "isPrimary",
    "isBilling"
  )
  SELECT
    'tac_' || substr(md5(random()::text || clock_timestamp()::text || ta.id || 'primary'), 1, 24),
    ta."companyId",
    ta."id",
    loc."id",
    'PRIMARY_CONTACT',
    coalesce(nullif(trim(ta."contactName"), ''), coalesce(nullif(trim(ta."name"), ''), 'Primary contact')),
    'Primary contact',
    nullif(trim(ta."contactEmail"), ''),
    nullif(trim(ta."contactPhone"), ''),
    nullif(trim(ta."contactMobile"), ''),
    true,
    false
  FROM "TradeAccount" ta
  JOIN "TradeAccountLocation" loc
    ON loc."tradeAccountId" = ta."id"
   AND loc."legacyAliasKey" = 'PRIMARY_BUSINESS'
  WHERE
    coalesce(trim(ta."contactName"), '') <> ''
    OR coalesce(trim(ta."contactEmail"), '') <> ''
    OR coalesce(trim(ta."contactPhone"), '') <> ''
    OR coalesce(trim(ta."contactMobile"), '') <> ''
),
secondary_contacts AS (
  INSERT INTO "TradeAccountContact" (
    "id",
    "companyId",
    "tradeAccountId",
    "tradeAccountLocationId",
    "legacyAliasKey",
    "name",
    "roleLabel",
    "email",
    "phone",
    "mobile",
    "isPrimary",
    "isBilling"
  )
  SELECT
    'tac_' || substr(md5(random()::text || clock_timestamp()::text || ta.id || 'secondary'), 1, 24),
    ta."companyId",
    ta."id",
    loc."id",
    'SECONDARY_CONTACT',
    coalesce(nullif(trim(ta."secondaryContactName"), ''), 'Secondary contact'),
    'Secondary contact',
    nullif(trim(ta."secondaryContactEmail"), ''),
    nullif(trim(ta."secondaryContactPhone"), ''),
    nullif(trim(ta."secondaryContactMobile"), ''),
    false,
    false
  FROM "TradeAccount" ta
  JOIN "TradeAccountLocation" loc
    ON loc."tradeAccountId" = ta."id"
   AND loc."legacyAliasKey" = 'PRIMARY_BUSINESS'
  WHERE
    coalesce(trim(ta."secondaryContactName"), '') <> ''
    OR coalesce(trim(ta."secondaryContactEmail"), '') <> ''
    OR coalesce(trim(ta."secondaryContactPhone"), '') <> ''
    OR coalesce(trim(ta."secondaryContactMobile"), '') <> ''
),
billing_contacts AS (
  INSERT INTO "TradeAccountContact" (
    "id",
    "companyId",
    "tradeAccountId",
    "tradeAccountLocationId",
    "legacyAliasKey",
    "name",
    "roleLabel",
    "email",
    "phone",
    "mobile",
    "isPrimary",
    "isBilling"
  )
  SELECT
    'tac_' || substr(md5(random()::text || clock_timestamp()::text || ta.id || 'billing-contact'), 1, 24),
    ta."companyId",
    ta."id",
    billing_loc."id",
    'BILLING_CONTACT',
    coalesce(nullif(trim(ta."billingContactName"), ''), 'Billing contact'),
    'Billing contact',
    nullif(trim(ta."billingEmail"), ''),
    nullif(trim(ta."billingPhone"), ''),
    nullif(trim(ta."billingMobile"), ''),
    false,
    true
  FROM "TradeAccount" ta
  JOIN "TradeAccountLocation" billing_loc
    ON billing_loc."tradeAccountId" = ta."id"
   AND billing_loc."legacyAliasKey" = 'BILLING_LOCATION'
  WHERE
    coalesce(trim(ta."billingContactName"), '') <> ''
    OR coalesce(trim(ta."billingEmail"), '') <> ''
    OR coalesce(trim(ta."billingPhone"), '') <> ''
    OR coalesce(trim(ta."billingMobile"), '') <> ''
)
SELECT 1;

INSERT INTO "TradeAccountContactPreference" ("id", "companyId", "contactId", "event", "channel", "enabled")
SELECT
  'tcp_' || substr(md5(random()::text || clock_timestamp()::text || c."id" || 'job-email'), 1, 24),
  c."companyId",
  c."id",
  'JOB_COMPLETION'::"TradeAccountContactPreferenceEvent",
  'EMAIL'::"TradeAccountContactPreferenceChannel",
  true
FROM "TradeAccountContact" c
WHERE c."legacyAliasKey" = 'PRIMARY_CONTACT' AND c."email" IS NOT NULL;

INSERT INTO "TradeAccountContactPreference" ("id", "companyId", "contactId", "event", "channel", "enabled")
SELECT
  'tcp_' || substr(md5(random()::text || clock_timestamp()::text || c."id" || 'general-whatsapp'), 1, 24),
  c."companyId",
  c."id",
  'GENERAL_NOTIFICATION'::"TradeAccountContactPreferenceEvent",
  'WHATSAPP'::"TradeAccountContactPreferenceChannel",
  true
FROM "TradeAccountContact" c
WHERE c."legacyAliasKey" = 'PRIMARY_CONTACT' AND coalesce(c."mobile", c."phone") IS NOT NULL;

INSERT INTO "TradeAccountContactPreference" ("id", "companyId", "contactId", "event", "channel", "enabled")
SELECT
  'tcp_' || substr(md5(random()::text || clock_timestamp()::text || c."id" || 'invoice-email'), 1, 24),
  c."companyId",
  c."id",
  'INVOICE'::"TradeAccountContactPreferenceEvent",
  'EMAIL'::"TradeAccountContactPreferenceChannel",
  true
FROM "TradeAccountContact" c
WHERE c."legacyAliasKey" = 'BILLING_CONTACT' AND c."email" IS NOT NULL;

INSERT INTO "TradeAccountContactPreference" ("id", "companyId", "contactId", "event", "channel", "enabled")
SELECT
  'tcp_' || substr(md5(random()::text || clock_timestamp()::text || c."id" || 'update-call'), 1, 24),
  c."companyId",
  c."id",
  'UPDATE_CALL'::"TradeAccountContactPreferenceEvent",
  'PHONE'::"TradeAccountContactPreferenceChannel",
  true
FROM "TradeAccountContact" c
WHERE c."legacyAliasKey" = 'PRIMARY_CONTACT' AND coalesce(c."phone", c."mobile") IS NOT NULL;
