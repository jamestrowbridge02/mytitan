#!/usr/bin/env node
/*
 * Safe, idempotent historical ActivityEvent customer linkage backfill.
 * Matching order favors confidence over coverage.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function scalar(query) {
  const rows = await prisma.$queryRawUnsafe(query);
  if (!Array.isArray(rows) || !rows[0]) return 0;
  const value = Object.values(rows[0])[0];
  return Number(value || 0);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const beforeTotal = await scalar('SELECT COUNT(*) FROM "ActivityEvent";');
  const beforeLinked = await scalar('SELECT COUNT(*) FROM "ActivityEvent" WHERE "customerId" IS NOT NULL;');
  const beforeUnlinked = beforeTotal - beforeLinked;

  console.log(`[backfill] dryRun=${dryRun}`);
  console.log(`[backfill] before total=${beforeTotal} linked=${beforeLinked} unlinked=${beforeUnlinked}`);

  let linkedViaJob = 0;
  let linkedViaPayloadId = 0;
  let linkedViaPayloadEmail = 0;
  let linkedViaPayloadPhone = 0;
  let linkedViaTenantName = 0;

  if (!dryRun) {
    // Rule 1: inherit job.customerId for events that reference a job.
    linkedViaJob = await prisma.$executeRawUnsafe(`
      UPDATE "ActivityEvent" a
      SET
        "customerId" = j."customerId",
        "tenantId" = COALESCE(a."tenantId", j."companyId"),
        "customerName" = COALESCE(NULLIF(BTRIM(a."customerName"), ''), j."customerName")
      FROM "Job" j
      WHERE a."customerId" IS NULL
        AND a."jobId" = j."id"
        AND j."customerId" IS NOT NULL
    `);

    // Rule 2: exact customerId in payloadJson, tenant-safe.
    linkedViaPayloadId = await prisma.$executeRawUnsafe(`
      UPDATE "ActivityEvent" a
      SET
        "customerId" = c."id",
        "tenantId" = COALESCE(a."tenantId", c."companyId"),
        "customerName" = COALESCE(NULLIF(BTRIM(a."customerName"), ''), c."name")
      FROM "Customer" c
      WHERE a."customerId" IS NULL
        AND COALESCE(a."payloadJson"->>'customerId', '') <> ''
        AND c."id" = a."payloadJson"->>'customerId'
        AND (a."tenantId" IS NULL OR a."tenantId" = c."companyId")
    `);

    // Rule 3: exact tenant + exact payload email, only when unambiguous.
    linkedViaPayloadEmail = await prisma.$executeRawUnsafe(`
      WITH candidate AS (
        SELECT
          a."id" AS activity_id,
          MIN(c."id") AS customer_id
        FROM "ActivityEvent" a
        JOIN "Customer" c
          ON c."companyId" = a."tenantId"
         AND LOWER(COALESCE(c."email", '')) = LOWER(COALESCE(a."payloadJson"->>'email', a."payloadJson"->>'customerEmail', ''))
        WHERE a."customerId" IS NULL
          AND a."tenantId" IS NOT NULL
          AND COALESCE(a."payloadJson"->>'email', a."payloadJson"->>'customerEmail', '') <> ''
        GROUP BY a."id"
        HAVING COUNT(*) = 1
      )
      UPDATE "ActivityEvent" a
      SET
        "customerId" = c.customer_id,
        "customerName" = COALESCE(NULLIF(BTRIM(a."customerName"), ''), cu."name")
      FROM candidate c
      JOIN "Customer" cu ON cu."id" = c.customer_id
      WHERE a."id" = c.activity_id
        AND a."customerId" IS NULL
    `);

    // Rule 4: exact tenant + exact payload phone, only when unambiguous.
    linkedViaPayloadPhone = await prisma.$executeRawUnsafe(`
      WITH candidate AS (
        SELECT
          a."id" AS activity_id,
          MIN(c."id") AS customer_id
        FROM "ActivityEvent" a
        JOIN "Customer" c
          ON c."companyId" = a."tenantId"
         AND COALESCE(c."phone", '') = COALESCE(a."payloadJson"->>'phone', a."payloadJson"->>'customerPhone', '')
        WHERE a."customerId" IS NULL
          AND a."tenantId" IS NOT NULL
          AND COALESCE(a."payloadJson"->>'phone', a."payloadJson"->>'customerPhone', '') <> ''
        GROUP BY a."id"
        HAVING COUNT(*) = 1
      )
      UPDATE "ActivityEvent" a
      SET
        "customerId" = c.customer_id,
        "customerName" = COALESCE(NULLIF(BTRIM(a."customerName"), ''), cu."name")
      FROM candidate c
      JOIN "Customer" cu ON cu."id" = c.customer_id
      WHERE a."id" = c.activity_id
        AND a."customerId" IS NULL
    `);

    // Rule 5: exact tenant + exact normalized customerName, only when unambiguous within tenant.
    linkedViaTenantName = await prisma.$executeRawUnsafe(`
      WITH customer_name_unique AS (
        SELECT
          c."companyId",
          LOWER(BTRIM(c."name")) AS normalized_name,
          MIN(c."id") AS customer_id,
          COUNT(*) AS matches
        FROM "Customer" c
        GROUP BY c."companyId", LOWER(BTRIM(c."name"))
      ),
      candidate AS (
        SELECT
          a."id" AS activity_id,
          u.customer_id
        FROM "ActivityEvent" a
        JOIN customer_name_unique u
          ON u."companyId" = a."tenantId"
         AND u.normalized_name = LOWER(BTRIM(a."customerName"))
         AND u.matches = 1
        WHERE a."customerId" IS NULL
          AND a."tenantId" IS NOT NULL
          AND COALESCE(BTRIM(a."customerName"), '') <> ''
      )
      UPDATE "ActivityEvent" a
      SET "customerId" = c.customer_id
      FROM candidate c
      WHERE a."id" = c.activity_id
        AND a."customerId" IS NULL
    `);
  }

  const afterTotal = await scalar('SELECT COUNT(*) FROM "ActivityEvent";');
  const afterLinked = await scalar('SELECT COUNT(*) FROM "ActivityEvent" WHERE "customerId" IS NOT NULL;');
  const afterUnlinked = afterTotal - afterLinked;
  const unlinkedMissingTenant = await scalar('SELECT COUNT(*) FROM "ActivityEvent" WHERE "customerId" IS NULL AND "tenantId" IS NULL;');
  const unlinkedWithTenant = await scalar('SELECT COUNT(*) FROM "ActivityEvent" WHERE "customerId" IS NULL AND "tenantId" IS NOT NULL;');

  console.log(`[backfill] linked via job=${linkedViaJob}`);
  console.log(`[backfill] linked via payload customerId=${linkedViaPayloadId}`);
  console.log(`[backfill] linked via payload email=${linkedViaPayloadEmail}`);
  console.log(`[backfill] linked via payload phone=${linkedViaPayloadPhone}`);
  console.log(`[backfill] linked via tenant+name=${linkedViaTenantName}`);
  console.log(`[backfill] after total=${afterTotal} linked=${afterLinked} unlinked=${afterUnlinked}`);
  console.log(`[backfill] remaining_unlinked tenant_missing=${unlinkedMissingTenant} tenant_present=${unlinkedWithTenant}`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
