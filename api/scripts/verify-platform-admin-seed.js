#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin@mytitan.co.uk";
const STALE_EMAIL = "e2e.platform@mytitan.co.uk";
const SEEDED_ADMIN_PASSWORD = "MyTitanE2EPlatform!2026";

function apiBase() {
  return String(process.env.MYTITAN_VERIFY_API_BASE_URL || process.env.API_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isPlatformAdminEmail(email) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
      role: true,
      isActive: true,
      companyId: true,
      company: { select: { id: true, name: true } },
    },
  });
  const stale = await prisma.user.findMany({
    where: { email: STALE_EMAIL },
    select: { id: true, email: true, emailVerified: true, role: true, isActive: true, companyId: true },
  });
  const internalAdmins = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, STALE_EMAIL] } },
    select: { email: true, role: true, emailVerified: true, isActive: true, companyId: true },
  });

  if (!admin) throw new Error("platform admin missing from runtime database");
  if (normalizeEmail(admin.email) !== ADMIN_EMAIL) throw new Error("platform admin email is not normalized");
  if (!admin.passwordHash) throw new Error("platform admin password hash missing");
  if (!(await bcrypt.compare(SEEDED_ADMIN_PASSWORD, admin.passwordHash))) {
    throw new Error("platform admin password hash does not match seeded credential policy");
  }
  if (admin.isActive === false) throw new Error("platform admin is inactive");
  if (!admin.emailVerified) throw new Error("platform admin email is not verified");
  if (admin.role !== "OWNER") throw new Error("platform admin role is not OWNER");
  if (!isPlatformAdminEmail(admin.email)) throw new Error("platform admin is not platform-admin eligible");
  if (stale.some((row) => row.isActive !== false)) throw new Error("stale e2e platform admin remains active");

  const loginResponse = await postJson(`${apiBase()}/auth/login`, {
    email: ` ${ADMIN_EMAIL.toUpperCase()} `,
    password: SEEDED_ADMIN_PASSWORD,
  });
  if (!loginResponse.ok) {
    throw new Error(`runtime platform admin login failed status=${loginResponse.status}`);
  }
  const loginBody = await loginResponse.json();
  const token = String(loginBody?.token || "");
  if (!token) throw new Error("runtime platform admin login did not return a token");
  if (!loginBody?.user?.platformAdmin) throw new Error("runtime login did not mark user as platform admin");

  const meResponse = await fetch(`${apiBase()}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meResponse.ok) {
    throw new Error(`runtime /me failed status=${meResponse.status}`);
  }
  const me = await meResponse.json();
  if (!me?.platformAdmin) throw new Error("runtime /me did not confirm platform admin access");

  console.log(JSON.stringify({
    ok: true,
    database: "runtime API database",
    admin: {
      email: admin.email,
      normalized: normalizeEmail(admin.email),
      active: Boolean(admin.isActive),
      emailVerified: Boolean(admin.emailVerified),
      role: admin.role,
      companyId: admin.companyId,
      companyName: admin.company?.name || null,
      hasPasswordHash: Boolean(admin.passwordHash),
      passwordHashMatchesSeededPolicy: true,
      platformAdminEligible: true,
    },
    staleFixtureAdminCount: stale.length,
    staleFixtureAdminsActive: stale.filter((row) => row.isActive !== false).length,
    checkedInternalAdminEmails: internalAdmins.map((row) => ({
      email: row.email,
      role: row.role,
      active: Boolean(row.isActive),
      emailVerified: Boolean(row.emailVerified),
      companyId: row.companyId,
      platformAdminEligible: isPlatformAdminEmail(row.email),
    })),
    runtimeLogin: {
      loginEndpointOk: true,
      meEndpointOk: true,
      tokenReturned: true,
      platformAdminConfirmed: true,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`seed:e2e:verify-platform-admin failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
