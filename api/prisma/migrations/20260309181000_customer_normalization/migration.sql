-- Add normalized customer domain (additive, backward-compatible)
CREATE TABLE IF NOT EXISTS "Customer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "slug" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_companyId_slug_key" ON "Customer"("companyId", "slug");
CREATE INDEX IF NOT EXISTS "Customer_companyId_name_idx" ON "Customer"("companyId", "name");
CREATE INDEX IF NOT EXISTS "Customer_companyId_email_idx" ON "Customer"("companyId", "email");
CREATE INDEX IF NOT EXISTS "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
CREATE INDEX IF NOT EXISTS "Customer_companyId_createdAt_idx" ON "Customer"("companyId", "createdAt");

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
DO $$
BEGIN
  IF to_regclass('public."ActivityEvent"') IS NOT NULL THEN
    ALTER TABLE "ActivityEvent" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Customer_companyId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Job_customerId_fkey'
  ) THEN
    ALTER TABLE "Job"
      ADD CONSTRAINT "Job_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public."ActivityEvent"') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ActivityEvent_customerId_fkey'
  ) THEN
    ALTER TABLE "ActivityEvent"
      ADD CONSTRAINT "ActivityEvent_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "Job_companyId_customerId_createdAt_idx" ON "Job"("companyId", "customerId", "createdAt");
DO $$
BEGIN
  IF to_regclass('public."ActivityEvent"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_customerId_at_idx" ON "ActivityEvent"("tenantId", "customerId", "at");
  END IF;
END$$;

-- Seed Customer rows from legacy job/activity string fields.
WITH source_customers AS (
  SELECT
    j."companyId" AS "companyId",
    btrim(j."customerName") AS name,
    NULLIF(btrim(j."customerEmail"), '') AS email,
    NULLIF(btrim(j."customerPhone"), '') AS phone
  FROM "Job" j
  WHERE COALESCE(btrim(j."customerName"), '') <> ''
),
dedup AS (
  SELECT DISTINCT
    "companyId",
    name,
    email,
    phone
  FROM source_customers
  WHERE "companyId" IS NOT NULL
    AND COALESCE(name, '') <> ''
),
ranked AS (
  SELECT
    d."companyId",
    d.name,
    d.email,
    d.phone,
    lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    row_number() OVER (
      PARTITION BY d."companyId", lower(regexp_replace(d.name, '[^a-zA-Z0-9]+', '-', 'g'))
      ORDER BY d.name, COALESCE(d.email, ''), COALESCE(d.phone, '')
    ) AS slug_rank
  FROM dedup d
)
INSERT INTO "Customer" ("id", "companyId", "slug", "name", "email", "phone", "createdAt", "updatedAt")
SELECT
  'cust_' || substr(md5(random()::text || clock_timestamp()::text || r."companyId" || r.name || COALESCE(r.email, '')), 1, 24) AS id,
  r."companyId",
  CASE
    WHEN COALESCE(r.base_slug, '') = '' THEN NULL
    WHEN r.slug_rank = 1 THEN r.base_slug
    ELSE r.base_slug || '-' || r.slug_rank::text
  END AS slug,
  r.name,
  r.email,
  r.phone,
  NOW(),
  NOW()
FROM ranked r
WHERE NOT EXISTS (
  SELECT 1
  FROM "Customer" c
  WHERE c."companyId" = r."companyId"
    AND lower(c."name") = lower(r.name)
    AND COALESCE(lower(c."email"), '') = COALESCE(lower(r.email), '')
    AND COALESCE(c."phone", '') = COALESCE(r.phone, '')
);

-- Link jobs to customers.
WITH job_matches AS (
  SELECT
    j."id" AS job_id,
    c."id" AS customer_id,
    row_number() OVER (
      PARTITION BY j."id"
      ORDER BY
        CASE
          WHEN j."customerEmail" IS NOT NULL AND c."email" IS NOT NULL AND lower(c."email") = lower(j."customerEmail") THEN 0
          ELSE 1
        END,
        CASE
          WHEN j."customerPhone" IS NOT NULL AND c."phone" IS NOT NULL AND c."phone" = j."customerPhone" THEN 0
          ELSE 1
        END,
        c."updatedAt" DESC
    ) AS rn
  FROM "Job" j
  JOIN "Customer" c
    ON c."companyId" = j."companyId"
   AND lower(c."name") = lower(btrim(j."customerName"))
  WHERE j."customerId" IS NULL
    AND COALESCE(btrim(j."customerName"), '') <> ''
)
UPDATE "Job" j
SET "customerId" = m.customer_id
FROM job_matches m
WHERE j."id" = m.job_id
  AND m.rn = 1;

-- Link activity to customer via job first.
DO $$
BEGIN
  IF to_regclass('public."ActivityEvent"') IS NOT NULL THEN
    UPDATE "ActivityEvent" a
    SET "customerId" = j."customerId"
    FROM "Job" j
    WHERE a."customerId" IS NULL
      AND a."jobId" = j."id"
      AND j."customerId" IS NOT NULL;
  END IF;
END$$;

-- Link activity to customer via tenant + customerName fallback.
DO $$
BEGIN
  IF to_regclass('public."ActivityEvent"') IS NOT NULL THEN
    WITH activity_matches AS (
      SELECT
        a."id" AS activity_id,
        c."id" AS customer_id,
        row_number() OVER (
          PARTITION BY a."id"
          ORDER BY c."updatedAt" DESC
        ) AS rn
      FROM "ActivityEvent" a
      JOIN "Customer" c
        ON c."companyId" = a."tenantId"
       AND lower(c."name") = lower(btrim(a."customerName"))
      WHERE a."customerId" IS NULL
        AND a."tenantId" IS NOT NULL
        AND COALESCE(btrim(a."customerName"), '') <> ''
    )
    UPDATE "ActivityEvent" a
    SET "customerId" = m.customer_id
    FROM activity_matches m
    WHERE a."id" = m.activity_id
      AND m.rn = 1;
  END IF;
END$$;
