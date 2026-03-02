import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function ok(msg) { console.log(`OK: ${msg}`); }
function warn(msg) { console.warn(`WARN: ${msg}`); }

async function main() {
  const companyCount = await prisma.company.count();
  ok(`Company count = ${companyCount}`);

  const constraint = await prisma.$queryRawUnsafe(`
    SELECT conname
    FROM pg_constraint
    WHERE conname = 'booking_no_overlap_company_technician'
    LIMIT 1
  `);
  if (Array.isArray(constraint) && constraint.length > 0) ok("Booking overlap exclusion constraint exists");
  else warn("Booking overlap exclusion constraint NOT found (expected in top1 pass)");

  const overlaps = await prisma.$queryRawUnsafe(`
    WITH b AS (
      SELECT "id","companyId","assignedUserId","startsAt","endsAt"
      FROM "Booking"
      WHERE "assignedUserId" IS NOT NULL AND "status" = 'PLANNED'
    )
    SELECT b1."companyId", b1."assignedUserId", b1."id" AS a, b2."id" AS b
    FROM b b1
    JOIN b b2
      ON b1."companyId" = b2."companyId"
     AND b1."assignedUserId" = b2."assignedUserId"
     AND b1."id" < b2."id"
     AND tsrange(b1."startsAt", b1."endsAt", '[)') && tsrange(b2."startsAt", b2."endsAt", '[)')
    LIMIT 10
  `);
  const n = Array.isArray(overlaps) ? overlaps.length : 0;
  if (n === 0) ok("No PLANNED overlaps detected");
  else warn(`Detected ${n} overlapping PLANNED booking pairs (showing up to 10)`);

  ok("top1-audit completed");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
