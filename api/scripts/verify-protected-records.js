#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const {
  blockUnsafeMutation,
  isMytitanStaffEmail,
  normalizeEmail,
} = require("./protected-mutation-policy");

const prisma = new PrismaClient();

async function safeCount(modelName, where) {
  const model = prisma[modelName];
  if (!model?.count) return null;
  try {
    return await model.count({ where });
  } catch {
    return null;
  }
}

async function listIds(modelName) {
  const model = prisma[modelName];
  if (!model?.findMany) return [];
  try {
    return (await model.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);
  } catch {
    return [];
  }
}

function sameIds(before, after) {
  return before.length === after.length && before.every((id, index) => id === after[index]);
}

async function verifiedStaffSnapshot() {
  return prisma.user.findMany({
    where: { email: { endsWith: "@mytitan.co.uk" }, emailVerified: true },
    select: { id: true, email: true, role: true, isActive: true, emailVerified: true },
    orderBy: { email: "asc" },
  });
}

function assertStaffNotDowngraded(before, after) {
  const afterByEmail = new Map(after.map((row) => [normalizeEmail(row.email), row]));
  for (const row of before) {
    if (!isMytitanStaffEmail(row.email)) continue;
    const current = afterByEmail.get(normalizeEmail(row.email));
    if (!current) throw new Error(`verified MyTitan staff account disappeared: ${normalizeEmail(row.email)}`);
    if (current.emailVerified !== true || current.isActive === false) {
      throw new Error(`verified MyTitan staff account was downgraded: ${normalizeEmail(row.email)}`);
    }
  }
}

function runSeedSilently() {
  execFileSync("npm", ["run", "seed:e2e"], {
    cwd: process.cwd(),
    env: { ...process.env, MYTITAN_ENABLE_E2E_FIXTURES: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function assertGuardBlocksUnsafeDelete() {
  let blocked = false;
  try {
    await blockUnsafeMutation(prisma, {
      action: "verify protected commercial delete block",
      area: "commercial records",
      target: "non-e2e-tenant",
      validationOnly: true,
      sourceRef: "api/scripts/verify-protected-records.js",
      error: "verification blocked non-e2e commercial delete",
    });
  } catch (error) {
    blocked = /blocked non-e2e commercial delete|Unsafe protected-record mutation blocked/i.test(String(error?.message || ""));
  }
  if (!blocked) throw new Error("protected delete guard did not block verification mutation");
}

async function main() {
  const providerBefore = {
    payment: await listIds("platformPaymentProviderConfig"),
    billingStripe: await listIds("platformBillingStripeConfig"),
    email: await listIds("platformEmailProviderConfig"),
    monitor: await listIds("platformExternalMonitorConfig"),
  };
  const countsBefore = {
    nonE2eUsers: await safeCount("user", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eCompanies: await safeCount("company", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eTrials: await safeCount("tenantSubscription", {
      NOT: { tenantId: { startsWith: "e2e-" } },
      OR: [{ trialStartedAt: { not: null } }, { trialEndsAt: { not: null } }, { status: { contains: "trial" } }],
    }),
    nonE2eBookings: await safeCount("booking", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eJobs: await safeCount("job", { NOT: { id: { startsWith: "e2e-" } } }),
    providerVaultRows: Object.values(providerBefore).reduce((sum, ids) => sum + ids.length, 0),
    providerVaultBreakdown: Object.fromEntries(Object.entries(providerBefore).map(([key, ids]) => [key, ids.length])),
  };
  const staffBefore = await verifiedStaffSnapshot();

  runSeedSilently();
  await assertGuardBlocksUnsafeDelete();

  const providerAfter = {
    payment: await listIds("platformPaymentProviderConfig"),
    billingStripe: await listIds("platformBillingStripeConfig"),
    email: await listIds("platformEmailProviderConfig"),
    monitor: await listIds("platformExternalMonitorConfig"),
  };
  const countsAfter = {
    nonE2eUsers: await safeCount("user", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eCompanies: await safeCount("company", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eTrials: await safeCount("tenantSubscription", {
      NOT: { tenantId: { startsWith: "e2e-" } },
      OR: [{ trialStartedAt: { not: null } }, { trialEndsAt: { not: null } }, { status: { contains: "trial" } }],
    }),
    nonE2eBookings: await safeCount("booking", { NOT: { id: { startsWith: "e2e-" } } }),
    nonE2eJobs: await safeCount("job", { NOT: { id: { startsWith: "e2e-" } } }),
    providerVaultRows: Object.values(providerAfter).reduce((sum, ids) => sum + ids.length, 0),
    providerVaultBreakdown: Object.fromEntries(Object.entries(providerAfter).map(([key, ids]) => [key, ids.length])),
  };
  assertStaffNotDowngraded(staffBefore, await verifiedStaffSnapshot());

  for (const [key, before] of Object.entries(providerBefore)) {
    if (!sameIds(before, providerAfter[key])) {
      throw new Error(`${key} provider/config rows changed during seed:e2e`);
    }
  }
  for (const [key, before] of Object.entries(countsBefore)) {
    if (typeof before === "object") continue;
    const after = countsAfter[key];
    if (before !== null && after !== null && after < before) {
      throw new Error(`${key} count decreased during seed:e2e`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    providerConfigRowsPreserved: true,
    verifiedStaffNotDowngraded: true,
    nonE2eCommercialCountsNotReduced: true,
    protectedDeleteBlocked: true,
    countsBefore,
    countsAfter,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "protected record verification failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
