import process from "node:process";
import { PrismaClient } from "@prisma/client";

function fail(msg) { console.error("FAIL:", msg); process.exit(1); }
function ok(msg) { console.log("OK:", msg); }

const prisma = new PrismaClient();

try {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");
  await prisma.$connect();
  ok("Connected to DB");

  const companies = await prisma.company.count();
  ok(`Company table reachable (count=${companies})`);

  const bookings = await prisma.booking.count();
  ok(`Booking table reachable (count=${bookings})`);

  const constraint = await prisma.$queryRaw`
    SELECT conname
    FROM pg_constraint
    WHERE conname = 'booking_no_overlap_company_technician'
    LIMIT 1;
  `;
  if (!Array.isArray(constraint) || constraint.length < 1) {
    fail("Missing DB constraint booking_no_overlap_company_technician");
  }
  ok("DB exclusion constraint booking_no_overlap_company_technician exists");

  // IMPORTANT:
  // Booking startsAt/endsAt are timestamp without time zone => use tsrange()
  // Default bounds for tsrange() are ''[)'' so omit the third arg entirely.
  const overlaps = await prisma.$queryRaw`
    WITH pairs AS (
      SELECT
        a.id AS a_id,
        b.id AS b_id,
        a."companyId" AS company_id,
        a."assignedUserId" AS user_id,
        a."startsAt" AS a_start,
        a."endsAt" AS a_end,
        b."startsAt" AS b_start,
        b."endsAt" AS b_end
      FROM "Booking" a
      JOIN "Booking" b
        ON a.id < b.id
       AND a."companyId" = b."companyId"
       AND a."assignedUserId" IS NOT NULL
       AND b."assignedUserId" = a."assignedUserId"
       AND tsrange(a."startsAt", a."endsAt") && tsrange(b."startsAt", b."endsAt")
    )
    SELECT * FROM pairs LIMIT 5;
  `;

  if (Array.isArray(overlaps) && overlaps.length > 0) {
    console.error("Found overlaps (sample):", overlaps);
    fail("Overlaps still exist; DB constraint should prevent this.");
  }
  ok("No overlapping bookings remain (companyId + assignedUserId)");

  ok("Smoke suite complete");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
