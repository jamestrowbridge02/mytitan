#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const {
  PRINCIPAL_ADMIN_EMAIL,
  normalizeEmail,
  safeFingerprint,
} = require("./protected-mutation-policy");

const prisma = new PrismaClient();

const PLATFORM_COMPANY = {
  id: "mytitan-staff",
  name: "MyTitan Staff",
  timezone: "Europe/London",
  currency: "GBP",
};
const PRINCIPAL_ADMIN_ID = "principal-admin-mytitan";
const E2E_PLATFORM_ADMIN_EMAIL = "e2e.platform.admin@mytitan.co.uk";

function isE2eScoped(row) {
  return String(row?.id || "").startsWith("e2e-") || String(row?.companyId || "").startsWith("e2e-");
}

function safeUser(row) {
  return row ? {
    id: row.id,
    email: normalizeEmail(row.email),
    companyId: row.companyId,
    companyName: row.company?.name || null,
    active: row.isActive !== false,
    emailVerified: row.emailVerified === true,
    role: row.role,
    e2eScoped: isE2eScoped(row),
    passwordHashPresent: Boolean(row.passwordHash),
    passwordHashFingerprint: row.passwordHash ? safeFingerprint(row.passwordHash) : null,
  } : null;
}

async function readUserByEmail(email) {
  return prisma.user.findMany({
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
}

async function main() {
  const beforeRows = await readUserByEmail(PRINCIPAL_ADMIN_EMAIL);
  if (beforeRows.length < 1) throw new Error("principal admin account is missing");
  if (beforeRows.length > 1) throw new Error(`principal admin email must be unique before repair; found ${beforeRows.length}`);
  const sourceAdmin = beforeRows[0];
  if (!sourceAdmin.passwordHash) throw new Error("principal admin password hash is missing");

  const wheelBefore = await readUserByEmail("hello@wheelar.co.uk");
  if (wheelBefore.length !== 1) throw new Error(`Wheel A&R owner must exist exactly once; found ${wheelBefore.length}`);
  const wheelFingerprint = safeFingerprint(wheelBefore[0].passwordHash);
  const beforeFingerprint = safeFingerprint(sourceAdmin.passwordHash);

  const result = await prisma.$transaction(async (tx) => {
    const platformCompany = await tx.company.upsert({
      where: { id: PLATFORM_COMPANY.id },
      create: PLATFORM_COMPANY,
      update: {
        name: PLATFORM_COMPANY.name,
        timezone: PLATFORM_COMPANY.timezone,
        currency: PLATFORM_COMPANY.currency,
      },
    });

    const productionAdmin = await tx.user.upsert({
      where: { id: PRINCIPAL_ADMIN_ID },
      create: {
        id: PRINCIPAL_ADMIN_ID,
        companyId: platformCompany.id,
        email: PRINCIPAL_ADMIN_EMAIL,
        emailVerified: true,
        passwordHash: sourceAdmin.passwordHash,
        role: "OWNER",
        isActive: true,
        defaultLocationId: null,
        lastActiveAt: new Date(),
      },
      update: {
        companyId: platformCompany.id,
        email: PRINCIPAL_ADMIN_EMAIL,
        emailVerified: true,
        passwordHash: sourceAdmin.passwordHash,
        role: "OWNER",
        isActive: true,
        defaultLocationId: null,
        lastActiveAt: new Date(),
      },
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
    });

    let neutralizedLegacy = null;
    if (sourceAdmin.id !== productionAdmin.id) {
      neutralizedLegacy = await tx.user.update({
        where: { id: sourceAdmin.id },
        data: {
          email: `neutralized-${sourceAdmin.id}@mytitan.invalid`,
          emailVerified: false,
          isActive: false,
          tokenVersion: { increment: 1 },
        },
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
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: platformCompany.id,
        userId: productionAdmin.id,
        type: "principal_admin_scope_repaired",
        message: `Principal admin moved to ${platformCompany.id}; password hash preserved; previous row ${sourceAdmin.id} neutralized=${Boolean(neutralizedLegacy)}.`,
      },
    });

    if (neutralizedLegacy) {
      await tx.auditEvent.create({
        data: {
          companyId: sourceAdmin.companyId,
          userId: null,
          type: "principal_admin_scope_repaired",
          message: `Legacy principal admin email removed from E2E-scoped row ${sourceAdmin.id}; production admin is ${productionAdmin.id}.`,
        },
      });
    }

    return { productionAdmin, neutralizedLegacy, platformCompany };
  });

  const afterRows = await readUserByEmail(PRINCIPAL_ADMIN_EMAIL);
  const e2eRows = await readUserByEmail(E2E_PLATFORM_ADMIN_EMAIL);
  const wheelAfter = await readUserByEmail("hello@wheelar.co.uk");
  if (afterRows.length !== 1) throw new Error(`principal admin email must exist once after repair; found ${afterRows.length}`);
  if (afterRows[0].passwordHash !== sourceAdmin.passwordHash) throw new Error("principal admin password hash changed during scope repair");
  if (afterRows[0].companyId === "e2e-company" || afterRows[0].company?.name === "__E2E MyTitan Workspace") {
    throw new Error("principal admin is still E2E scoped after repair");
  }
  if (e2eRows.length !== 1) throw new Error(`E2E platform admin fixture must exist once; found ${e2eRows.length}`);
  if (wheelAfter.length !== 1 || safeFingerprint(wheelAfter[0].passwordHash) !== wheelFingerprint) {
    throw new Error("Wheel A&R owner changed during principal admin scope repair");
  }

  console.log(JSON.stringify({
    ok: true,
    adminBefore: safeUser(sourceAdmin),
    adminAfter: safeUser(afterRows[0]),
    passwordHashPreserved: beforeFingerprint === safeFingerprint(afterRows[0].passwordHash),
    e2eFixture: safeUser(e2eRows[0]),
    wheelArUnchanged: true,
    neutralizedLegacy: safeUser(result.neutralizedLegacy),
    auditEvent: "principal_admin_scope_repaired",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "principal admin scope repair failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
