#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const {
  PRINCIPAL_ADMIN_EMAIL,
  normalizeEmail,
  recordProtectedMutationWarning,
  safeFingerprint,
} = require("./protected-mutation-policy");

const prisma = new PrismaClient();

const TARGET_EMAILS = [PRINCIPAL_ADMIN_EMAIL, "hello@wheelar.co.uk"];
const E2E_PLATFORM_ADMIN_EMAIL = "e2e.platform.admin@mytitan.co.uk";

function isE2eRow(row) {
  return String(row?.id || "").startsWith("e2e-") || String(row?.companyId || "").startsWith("e2e-");
}

function publicUserState(row) {
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    exists: true,
    active: row.isActive !== false,
    emailVerified: row.emailVerified === true,
    role: row.role,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
    e2eScoped: isE2eRow(row),
    passwordHashPresent: Boolean(row.passwordHash),
    passwordHashFingerprint: row.passwordHash ? safeFingerprint(row.passwordHash) : null,
  };
}

async function readTarget(email) {
  const rows = await prisma.user.findMany({
    where: { email },
    select: {
      id: true,
      email: true,
      companyId: true,
      isActive: true,
      emailVerified: true,
      role: true,
      passwordHash: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });
  if (rows.length !== 1) {
    throw new Error(`${email} must exist exactly once; found ${rows.length}`);
  }
  const row = rows[0];
  if (!row.passwordHash) throw new Error(`${email} password hash is missing`);
  return row;
}

async function readTargets() {
  const entries = [];
  for (const email of TARGET_EMAILS) {
    entries.push([email, await readTarget(email)]);
  }
  return new Map(entries);
}

async function readE2ePlatformAdmin() {
  const rows = await prisma.user.findMany({
    where: { email: E2E_PLATFORM_ADMIN_EMAIL },
    select: {
      id: true,
      email: true,
      companyId: true,
      isActive: true,
      emailVerified: true,
      role: true,
      passwordHash: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });
  if (rows.length !== 1) throw new Error(`${E2E_PLATFORM_ADMIN_EMAIL} must exist exactly once; found ${rows.length}`);
  if (!isE2eRow(rows[0])) throw new Error(`${E2E_PLATFORM_ADMIN_EMAIL} must remain E2E scoped`);
  if (!rows[0].passwordHash) throw new Error(`${E2E_PLATFORM_ADMIN_EMAIL} password hash is missing`);
  return rows[0];
}

async function readNonE2eUserHashes() {
  const rows = await prisma.user.findMany({
    where: { NOT: { id: { startsWith: "e2e-" } } },
    select: {
      id: true,
      email: true,
      companyId: true,
      passwordHash: true,
    },
    orderBy: { id: "asc" },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

function runSeedSilently() {
  try {
    execFileSync("npm", ["run", "seed:e2e"], {
      cwd: process.cwd(),
      env: { ...process.env, MYTITAN_ENABLE_E2E_FIXTURES: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    return { ran: true, blocked: false };
  } catch (error) {
    const stderr = String(error?.stderr || "");
    if (/refused:/i.test(stderr)) {
      return { ran: false, blocked: true };
    }
    throw error;
  }
}

async function recordDrift(area, target, summary) {
  await recordProtectedMutationWarning(prisma, {
    action: "verify user password hash stability",
    area,
    target,
    summary,
    severity: "critical",
    validationOnly: true,
    sourceRef: "api/scripts/verify-user-password-hash-stability.js",
  });
}

async function main() {
  const targetsBefore = await readTargets();
  const e2ePlatformBefore = await readE2ePlatformAdmin();
  const nonE2eBefore = await readNonE2eUserHashes();

  const seed = runSeedSilently();

  const targetsAfter = await readTargets();
  const e2ePlatformAfter = await readE2ePlatformAdmin();
  const nonE2eAfter = await readNonE2eUserHashes();

  for (const [email, before] of targetsBefore.entries()) {
    const after = targetsAfter.get(email);
    if (!after || before.id !== after.id) {
      await recordDrift("protected user", email, "Protected user identity changed during seed:e2e.");
      throw new Error(`${email} identity changed during seed:e2e`);
    }
    if (email === PRINCIPAL_ADMIN_EMAIL && isE2eRow(after)) {
      await recordDrift("protected user", email, "Principal admin is still E2E scoped after seed:e2e.");
      throw new Error(`${email} must not be E2E scoped`);
    }
    if (before.passwordHash !== after.passwordHash) {
      await recordDrift("protected user", email, "Protected user password hash changed during seed:e2e.");
      throw new Error(`${email} password fingerprint changed during seed:e2e`);
    }
    if (
      before.companyId !== after.companyId ||
      before.role !== after.role ||
      before.isActive !== after.isActive ||
      before.emailVerified !== after.emailVerified
    ) {
      await recordDrift("protected user", email, "Protected user attributes changed during seed:e2e.");
      throw new Error(`${email} protected attributes changed during seed:e2e`);
    }
  }

  for (const [id, before] of nonE2eBefore.entries()) {
    const after = nonE2eAfter.get(id);
    if (!after) continue;
    if (before.passwordHash !== after.passwordHash) {
      await recordDrift("non-e2e user", normalizeEmail(before.email), "Non-E2E user password hash changed during seed:e2e.");
      throw new Error(`non-e2e user password fingerprint changed during seed:e2e: ${normalizeEmail(before.email)}`);
    }
  }

  const protectedUsers = Object.fromEntries(
    [...targetsAfter.entries()].map(([email, row]) => [email, publicUserState(row)]),
  );

  console.log(JSON.stringify({
    ok: true,
    operation: "seed:e2e",
    seedE2eRan: seed.ran,
    seedE2eBlockedByBoundary: seed.blocked,
    protectedUsers,
    e2ePlatformAdmin: publicUserState(e2ePlatformAfter),
    e2ePlatformAdminStable: e2ePlatformBefore.id === e2ePlatformAfter.id && e2ePlatformBefore.passwordHash === e2ePlatformAfter.passwordHash,
    nonE2eUserHashesStable: true,
    protectedUserHashesStable: true,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "user password hash stability verification failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
