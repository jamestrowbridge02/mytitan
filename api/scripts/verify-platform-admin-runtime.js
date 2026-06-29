#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin@mytitan.co.uk";
const STALE_EMAIL = "e2e.platform@mytitan.co.uk";
const E2E_ADMIN_PASSWORD = "MyTitanE2EPlatform!2026";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isMytitanStaff(email) {
  return normalizeEmail(email).endsWith("@mytitan.co.uk");
}

function isPlatformEligible(row) {
  const email = normalizeEmail(row?.email);
  if (email === ADMIN_EMAIL) return row?.emailVerified === true;
  return isMytitanStaff(email) && row?.emailVerified === true;
}

function apiBase() {
  return String(process.env.MYTITAN_VERIFY_API_BASE_URL || process.env.API_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

function appBase() {
  return String(process.env.MYTITAN_VERIFY_APP_BASE_URL || process.env.APP_INTERNAL_URL || "http://app:3001").replace(/\/$/, "");
}

function configuredPrincipalPassword(admin) {
  const fromEnv = process.env.MYTITAN_PRINCIPAL_ADMIN_PASSWORD || process.env.PLATFORM_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "";
  if (fromEnv) return { value: fromEnv, source: "configured" };
  if (process.env.MYTITAN_ENABLE_E2E_FIXTURES === "1") return { value: E2E_ADMIN_PASSWORD, source: "e2e_fixture" };
  if (admin?.companyId === "e2e-company") return { value: E2E_ADMIN_PASSWORD, source: "seeded_e2e_fixture" };
  return { value: "", source: "not_configured" };
}

function redactDatabaseUrl(raw) {
  try {
    const parsed = new URL(String(raw || ""));
    return {
      protocol: parsed.protocol.replace(":", ""),
      host: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return { protocol: null, host: null, port: null, database: null };
  }
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function main() {
  const dbTarget = redactDatabaseUrl(process.env.DATABASE_URL);
  const [admin, stale, internalRows, principalRows] = await Promise.all([
    prisma.user.findFirst({
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
    }),
    prisma.user.findMany({
      where: { email: STALE_EMAIL },
      select: { email: true, emailVerified: true, role: true, isActive: true, companyId: true },
    }),
    prisma.user.findMany({
      where: { email: { endsWith: "@mytitan.co.uk" } },
      select: { email: true, emailVerified: true, role: true, isActive: true, companyId: true },
      orderBy: { email: "asc" },
    }),
    prisma.user.findMany({
      where: { email: ADMIN_EMAIL },
      select: { email: true, emailVerified: true, role: true, isActive: true, companyId: true },
    }),
  ]);

  if (!admin) throw new Error("principal platform admin missing from runtime database");
  let password = configuredPrincipalPassword(admin);
  let passwordCompare =
    password.value && admin.passwordHash ? await bcrypt.compare(password.value, admin.passwordHash) : false;
  if (password.source === "e2e_fixture" && !passwordCompare) {
    password = { value: "", source: "protected_existing_hash" };
    passwordCompare = false;
  }
  if (password.source === "seeded_e2e_fixture" && !passwordCompare) {
    password = { value: "", source: "protected_existing_hash" };
    passwordCompare = false;
  }
  if (!admin.passwordHash) throw new Error("principal platform admin password hash missing");
  if (admin.isActive === false) throw new Error("principal platform admin is inactive");
  if (!admin.emailVerified) throw new Error("principal platform admin email is not verified");
  if (admin.role !== "OWNER") throw new Error("principal platform admin role is not OWNER");
  if (!isPlatformEligible(admin)) throw new Error("principal platform admin is not platform eligible");
  if (principalRows.filter((row) => row.isActive !== false).length !== 1) {
    throw new Error("runtime database must contain exactly one active principal platform admin");
  }
  if (!["not_configured", "protected_existing_hash"].includes(password.source) && !passwordCompare) {
    throw new Error("configured principal platform admin password does not match runtime hash");
  }
  if (stale.some((row) => row.isActive !== false)) throw new Error("stale fixture platform admin remains active");

  let loginStatus = "not_configured";
  let meStatus = "not_configured";
  let loginPlatformAdmin = false;
  let tokenReturned = false;
  if (password.value) {
    const loginResponse = await postJson(`${apiBase()}/auth/login`, {
      email: ` ${ADMIN_EMAIL.toUpperCase()} `,
      password: password.value,
    });
    loginStatus = loginResponse.status;
    if (!loginResponse.ok) throw new Error(`runtime platform admin login failed status=${loginResponse.status}`);
    const loginBody = await loginResponse.json();
    const token = String(loginBody?.token || "");
    tokenReturned = Boolean(token);
    loginPlatformAdmin = Boolean(loginBody?.user?.platformAdmin);
    if (!tokenReturned) throw new Error("runtime platform admin login did not return a token");
    if (!loginPlatformAdmin) throw new Error("runtime login did not mark user as platform admin");
    const meResponse = await fetch(`${apiBase()}/me`, { headers: { Authorization: `Bearer ${token}` } });
    meStatus = meResponse.status;
    if (!meResponse.ok) throw new Error(`runtime /me failed status=${meResponse.status}`);
    const me = await meResponse.json();
    if (!me?.platformAdmin) throw new Error("runtime /me did not confirm platform admin access");
  }

  const [loginPage, platformPage] = await Promise.all([
    fetch(`${appBase()}/login`).catch((error) => ({ ok: false, status: `error:${error?.code || "fetch"}` })),
    fetch(`${appBase()}/platform`).catch((error) => ({ ok: false, status: `error:${error?.code || "fetch"}` })),
  ]);

  console.log(JSON.stringify({
    ok: true,
    runtimeSource: {
      apiContainer: process.env.HOSTNAME || "mytitan_api",
      apiLoginEndpoint: `${apiBase()}/auth/login`,
      appLoginUrl: `${appBase()}/login`,
      appPlatformUrl: `${appBase()}/platform`,
      database: dbTarget,
      userModel: "User",
      companyRelation: "User.companyId -> Company.id",
      authState: "JWT bearer token stored by browser client",
      platformEligibility: "admin@mytitan.co.uk principal or verified @mytitan.co.uk staff or explicit allowlist",
    },
    principalAdmin: {
      email: admin.email,
      normalized: normalizeEmail(admin.email),
      active: Boolean(admin.isActive),
      emailVerified: Boolean(admin.emailVerified),
      role: admin.role,
      companyId: admin.companyId,
      companyName: admin.company?.name || null,
      hasPasswordHash: Boolean(admin.passwordHash),
      configuredPasswordSource: password.source,
      bcryptCompare: Boolean(passwordCompare),
      platformAdminEligible: true,
    },
    staleFixtureAdminCount: stale.length,
    staleFixtureAdminsActive: stale.filter((row) => row.isActive !== false).length,
    principalAdminRecordCount: principalRows.length,
    principalAdminActiveCount: principalRows.filter((row) => row.isActive !== false).length,
    mytitanStaff: internalRows.map((row) => ({
      email: row.email,
      active: Boolean(row.isActive),
      emailVerified: Boolean(row.emailVerified),
      role: row.role,
      companyId: row.companyId,
      platformAdminEligible: isPlatformEligible(row),
    })),
    runtimeLogin: {
      loginEndpointStatus: loginStatus,
      meEndpointStatus: meStatus,
      tokenReturned,
      platformAdminConfirmed: loginPlatformAdmin,
    },
    appRoutes: {
      loginStatus: loginPage.status,
      loginReachable: Boolean(loginPage.ok),
      platformStatus: platformPage.status,
      platformReachable: Boolean(platformPage.ok),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`auth:verify-platform-admin-runtime failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
