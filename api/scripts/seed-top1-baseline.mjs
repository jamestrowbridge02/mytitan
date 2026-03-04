import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name, fallback = "") {
  return (process.env[name] || fallback).toString();
}

async function ensureCompany(name, timezone = "Europe/London", currency = "GBP") {
  const db = prisma;
  if (db.company?.findFirst) {
    const existing = await db.company.findFirst({ where: { name } });
    if (existing) return existing;
    return await db.company.create({ data: { name, timezone, currency } });
  }
  if (db.tenant?.findFirst) {
    const existing = await db.tenant.findFirst({ where: { name } });
    if (existing) return existing;
    return await db.tenant.create({ data: { name, timezone, currency } });
  }
  throw new Error("Neither prisma.company nor prisma.tenant exists. Check schema.");
}

async function ensureTenantSetting(tenantId) {
  const db = prisma;
  if (!db.tenantSetting?.upsert) throw new Error("prisma.tenantSetting missing");
  return await db.tenantSetting.upsert({
    where: { tenantId },
    update: { primaryTrade: "WHEELS" },
    create: { tenantId, primaryTrade: "WHEELS" },
  });
}

async function ensureOwnerUser(email, companyId, password) {
  const db = prisma;
  if (!db.user?.findFirst) throw new Error("prisma.user missing");

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findFirst({ where: { email } });

  if (existing) {
    const data = { companyId, role: "OWNER" };
    try {
      await db.user.update({ where: { id: existing.id }, data: { ...data, passwordHash } });
    } catch {
      await db.user.update({ where: { id: existing.id }, data: { ...data, password: passwordHash } });
    }
    return await db.user.findUnique({ where: { id: existing.id } });
  }

  try {
    return await db.user.create({
      data: { email, companyId, role: "OWNER", passwordHash, name: "MyTitan Owner" },
    });
  } catch {
    return await db.user.create({
      data: { email, companyId, role: "OWNER", password: passwordHash, name: "MyTitan Owner" },
    });
  }
}

async function main() {
  const password = env("TOP1_OWNER_PASSWORD");
  if (!password) throw new Error("TOP1_OWNER_PASSWORD env required for seed script");

  const mytitan = await ensureCompany("MyTitan", "Europe/London", "GBP");
  const acme = await ensureCompany("Acme Tenant", "Europe/London", "GBP");

  await ensureTenantSetting(mytitan.id);
  await ensureTenantSetting(acme.id);

  await ensureOwnerUser(env("TOP1_OWNER_EMAIL", "support@mytitan.co.uk"), mytitan.id, password);

  console.log("==> Seed complete");
  console.log(`MyTitan tenantId: ${mytitan.id}`);
  console.log(`Acme Tenant tenantId: ${acme.id}`);
}

main()
  .catch((e) => {
    console.error("SEED_FATAL:", e?.stack || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
