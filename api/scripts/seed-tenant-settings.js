#!/usr/bin/env node
let PrismaClient;
try {
  ({ PrismaClient } = require('@prisma/client'));
} catch {
  ({ PrismaClient } = require('../node_modules/.prisma/client'));
}

const prisma = new PrismaClient();
const DEFAULT_PLAN_CODE = 'SOLE_TRADER';

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, timezone: true, currency: true },
  });

  let created = 0;

  for (const company of companies) {
    const exists = await prisma.tenantSetting.findUnique({ where: { tenantId: company.id } });
    if (exists) continue;

    const defaultPlan = await prisma.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });
    await prisma.tenantSetting.create({
      data: {
        tenantId: company.id,
        planId: defaultPlan ? defaultPlan.id : null,
        companyName: company.name,
        defaultCurrency: company.currency || 'USD',
        defaultTimezone: company.timezone || 'UTC',
      },
    });
    created += 1;
  }

  console.log(`Tenant settings seeded. Created: ${created}, Existing: ${companies.length - created}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
