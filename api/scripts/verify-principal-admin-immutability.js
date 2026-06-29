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

async function readPrincipal() {
  const rows = await prisma.user.findMany({
    where: { email: PRINCIPAL_ADMIN_EMAIL },
    select: {
      id: true,
      email: true,
      companyId: true,
      passwordHash: true,
      role: true,
      isActive: true,
      emailVerified: true,
    },
  });
  if (rows.length !== 1) throw new Error(`principal admin must exist once; found ${rows.length}`);
  const admin = rows[0];
  if (!admin.passwordHash) throw new Error("principal admin password hash is missing");
  if (admin.role !== "OWNER") throw new Error("principal admin role is not OWNER");
  if (admin.isActive === false) throw new Error("principal admin is inactive");
  if (admin.emailVerified !== true) throw new Error("principal admin email is not verified");
  if (normalizeEmail(admin.email) !== PRINCIPAL_ADMIN_EMAIL) throw new Error("principal admin email is not normalized");
  return admin;
}

function runSeedSilently() {
  execFileSync("npm", ["run", "seed:e2e"], {
    cwd: process.cwd(),
    env: { ...process.env, MYTITAN_ENABLE_E2E_FIXTURES: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function main() {
  const before = await readPrincipal();
  const beforeFingerprint = safeFingerprint(before.passwordHash);
  runSeedSilently();
  const after = await readPrincipal();
  const afterFingerprint = safeFingerprint(after.passwordHash);
  if (before.passwordHash !== after.passwordHash) {
    await recordProtectedMutationWarning(prisma, {
      action: "verify principal admin immutability",
      area: "principal admin",
      target: PRINCIPAL_ADMIN_EMAIL,
      summary: "Principal admin password hash changed during guarded verification.",
      severity: "critical",
      validationOnly: true,
      sourceRef: "api/scripts/verify-principal-admin-immutability.js",
    });
    throw new Error("principal admin password fingerprint changed during seed:e2e");
  }
  if (before.role !== after.role || before.companyId !== after.companyId || after.isActive !== true || after.emailVerified !== true) {
    throw new Error("principal admin protected attributes drifted during seed:e2e");
  }

  const guardLogs = await prisma.platformSafeErrorLog.count({
    where: {
      category: "protected_mutation_guard",
      auditProtected: true,
    },
  });

  console.log(JSON.stringify({
    ok: true,
    principalAdmin: {
      email: PRINCIPAL_ADMIN_EMAIL,
      existsOnce: true,
      active: true,
      emailVerified: true,
      role: after.role,
      passwordFingerprintStable: beforeFingerprint === afterFingerprint,
    },
    seedE2ePreservedPrincipalAdmin: true,
    protectedGuardAuditPresent: guardLogs > 0,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "principal admin immutability verification failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
