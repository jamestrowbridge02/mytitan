#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const prisma = new PrismaClient();

const FIXTURE = {
  company: {
    id: "e2e-company",
    name: "__E2E MyTitan Workspace",
    timezone: "UTC",
    currency: "GBP",
  },
  locations: {
    hq: {
      id: "e2e-location-hq",
      code: "HQ",
      name: "E2E HQ",
      kind: "BRANCH",
    },
    north: {
      id: "e2e-location-north",
      code: "NORTH",
      name: "E2E North Branch",
      kind: "FRANCHISE",
    },
  },
  operator: {
    id: "e2e-user-operator",
    email: "e2e.operator@mytitan.local",
    password: "MyTitanE2E!2026",
    role: "OWNER",
  },
  workspaceUsers: {
    admin: { id: "e2e-user-admin", email: "e2e.admin@mytitan.local", password: "MyTitanE2EAdmin!2026", role: "ADMIN" },
    dispatcher: { id: "e2e-user-dispatcher", email: "e2e.dispatcher@mytitan.local", password: "MyTitanE2EDispatch!2026", role: "DISPATCHER" },
    finance: { id: "e2e-user-finance", email: "e2e.finance@mytitan.local", password: "MyTitanE2EFinance!2026", role: "FINANCE" },
    technician: { id: "e2e-user-technician", email: "e2e.technician@mytitan.local", password: "MyTitanE2ETech!2026", role: "TECHNICIAN" },
    externalOperator: { id: "e2e-user-external-operator", email: "e2e.external@mytitan.local", password: "MyTitanE2EExternal!2026", role: "EXTERNAL_OPERATOR" },
    viewer: { id: "e2e-user-viewer", email: "e2e.viewer@mytitan.local", password: "MyTitanE2EViewer!2026", role: "VIEWER" },
    passwordReset: { id: "e2e-user-password-reset", email: "e2e.password.reset@mytitan.example", password: "MyTitanReset!2026", role: "ADMIN" },
  },
  platformAdmin: {
    id: "e2e-user-platform-admin",
    email: "admin@mytitan.co.uk",
    staleEmail: "e2e.platform@mytitan.co.uk",
    password: "MyTitanE2EPlatform!2026",
    role: "OWNER",
  },
  platformStaff: {
    verified: {
      id: "e2e-user-platform-staff-verified",
      email: "ops.staff@mytitan.co.uk",
      password: "MyTitanStaff!2026",
      role: "STAFF",
      emailVerified: true,
    },
    unverified: {
      id: "e2e-user-platform-staff-unverified",
      email: "pending.staff@mytitan.co.uk",
      password: "MyTitanPending!2026",
      role: "STAFF",
      emailVerified: false,
    },
  },
  supportAccount: {
    company: {
      id: "e2e-support-company",
      name: "__E2E MyTitan Support Workspace",
      timezone: "UTC",
      currency: "GBP",
    },
    user: {
      id: "e2e-user-support",
      email: "support@mytitan.co.uk",
      password: "MyTitanSupport!2026",
      role: "OWNER",
    },
  },
  boardView: {
    id: "e2e-board-view-default",
    name: "E2E Workflow Board",
  },
  commandView: {
    id: "e2e-command-view-default",
    name: "E2E Workflow View",
  },
  service: {
    id: "e2e-service-wheel-repair",
    key: "e2e_wheel_repair",
    name: "E2E Wheel Repair",
  },
  customers: {
    convertible: { id: "e2e-customer-convertible", slug: "e2e-convertible", name: "E2E Convertible Customer", email: "convertible@mytitan.local", phone: "+447700900101" },
    blocked: { id: "e2e-customer-blocked", slug: "e2e-blocked", name: "E2E Blocked Customer", email: "blocked@mytitan.local", phone: "+447700900102" },
    invoiceReady: { id: "e2e-customer-invoice-ready", slug: "e2e-invoice-ready", name: "E2E Invoice Ready", email: "invoice-ready@mytitan.local", phone: "+447700900103" },
    issued: { id: "e2e-customer-issued", slug: "e2e-issued", name: "E2E Issued Awaiting Payment", email: "issued@mytitan.local", phone: "+447700900104" },
    portalActive: { id: "e2e-customer-portal-active", slug: "e2e-portal-active", name: "E2E Portal Active", email: "portal-active@mytitan.local", phone: "+447700900105" },
    portalExpired: { id: "e2e-customer-portal-expired", slug: "e2e-portal-expired", name: "E2E Portal Expired", email: "portal-expired@mytitan.local", phone: "+447700900106" },
    technician: { id: "e2e-customer-technician", slug: "e2e-technician", name: "E2E Technician Customer", email: "tech@mytitan.local", phone: "+447700900107" },
    open: { id: "e2e-customer-open", slug: "e2e-open", name: "E2E Open Queue Customer", email: "open@mytitan.local", phone: "+447700900108" },
    automation: { id: "e2e-customer-automation", slug: "e2e-automation", name: "E2E Automation Customer", email: "automation@mytitan.local", phone: "+447700900109" },
    financeOps: { id: "e2e-customer-finance-ops", slug: "e2e-finance-ops", name: "E2E Finance Ops", email: "finance-ops@mytitan.local", phone: "+447700900110" },
    technicianRole: { id: "e2e-customer-technician-role", slug: "e2e-technician-role", name: "E2E Technician Role Customer", email: "technician-role@mytitan.local", phone: "+447700900111" },
  },
  customerWorkspace: {
    activeAccount: {
      id: "e2e-customer-account-active",
      email: "portal-active@mytitan.local",
      password: "MyTitanCustomer!2026",
    },
    invitedAccount: {
      id: "e2e-customer-account-invited",
      email: "blocked@mytitan.local",
      inviteToken: "custinvite_e2e_customer_invited",
    },
  },
  customerApprovals: {
    pendingJob: { id: "e2e-customer-approval-pending-job" },
    approvedDocument: { id: "e2e-customer-approval-approved-document" },
    pendingQuote: { id: "e2e-customer-approval-pending-quote" },
  },
  jobs: {
    invoiceReady: { id: "e2e-job-invoice-ready", jobRef: "E2E-INV-READY-001" },
    issued: { id: "e2e-job-issued", jobRef: "E2E-ISSUED-001" },
    portalActive: { id: "e2e-job-portal-active", jobRef: "E2E-PORTAL-ACTIVE-001" },
    portalExpired: { id: "e2e-job-portal-expired", jobRef: "E2E-PORTAL-EXPIRED-001" },
    technician: { id: "e2e-job-technician", jobRef: "E2E-TECH-001" },
    automation: { id: "e2e-job-automation", jobRef: "E2E-AUTO-001" },
    open: { id: "e2e-job-open", jobRef: "E2E-OPEN-001" },
    financeReady: { id: "e2e-job-finance-ready", jobRef: "E2E-FIN-READY-001" },
    technicianRole: { id: "e2e-job-technician-role", jobRef: "E2E-TECH-ROLE-001" },
  },
  bookings: {
    convertible: { id: "e2e-booking-convertible" },
    blocked: { id: "e2e-booking-blocked" },
    technician: { id: "e2e-booking-technician" },
    technicianRole: { id: "e2e-booking-technician-role" },
  },
  customFields: {
    jobSerialNumber: { id: "e2e-field-job-serial-number", key: "serial_number", label: "Serial number", entityType: "JOB", type: "TEXT" },
    jobWarrantyStatus: { id: "e2e-field-job-warranty-status", key: "warranty_status", label: "Warranty status", entityType: "JOB", type: "SELECT", optionsJson: ["active", "expired", "unknown"] },
    bookingSource: { id: "e2e-field-booking-source", key: "booking_source", label: "Booking source", entityType: "BOOKING", type: "SELECT", optionsJson: ["phone", "website", "trade"] },
    customerSiteCode: { id: "e2e-field-customer-site-code", key: "site_code", label: "Site code", entityType: "CUSTOMER", type: "TEXT" },
    technicianCertification: { id: "e2e-field-technician-certification", key: "certification", label: "Certification", entityType: "TECHNICIAN", type: "TEXT" },
  },
  tokens: {
    active: "e2e-public-portal-token",
    expired: "e2e-expired-portal-token",
  },
  integrations: {
    googleCalendar: {
      id: "e2e-integration-google-operator",
    },
    tenantCredentials: {
      stripe: { id: "e2e-byog-stripe-workspace", routeId: "e2estripecustomerroute001" },
      quickbooks: { id: "e2e-byog-quickbooks-workspace", routeId: "e2eqbohookroute001" },
      personalGoogle: { id: "e2e-byog-google-personal", routeId: "e2egooglepersonal001" },
      supportGenericWebhook: { id: "e2e-byog-support-webhook", routeId: "e2esupportroute001" },
    },
    apiToken: {
      id: "e2e-api-token-primary",
      name: "E2E Primary Token",
      publicId: "e2eapitoken",
      secret: "seeded-platform-secret",
    },
    webhook: {
      id: "e2e-webhook-ops",
      name: "E2E Operations Webhook",
      url: "https://example.invalid/mytitan-webhook",
      secret: "whsec_e2e_seeded_webhook_secret",
      subscribedEventTypes: ["job.created", "job.completed", "invoice.issued", "automation.rule_ran"],
    },
    deliveries: {
      success: "e2e-webhook-delivery-success",
      failed: "e2e-webhook-delivery-failed",
    },
  },
  artifacts: {
    jobInvoice: { id: "e2e-artifact-job-invoice", label: "Seeded invoice pack", fileName: "invoice-pack.txt" },
    jobPortal: { id: "e2e-artifact-job-portal", label: "Customer completion summary", fileName: "completion-summary.txt" },
    customerAttachment: { id: "e2e-artifact-customer", label: "Customer warranty note", fileName: "warranty-note.txt" },
  },
  executionRecords: {
    technicianDraft: { id: "e2e-job-execution-technician-draft" },
    portalSubmitted: { id: "e2e-job-execution-portal-submitted" },
    technicianRoleSubmitted: { id: "e2e-job-execution-technician-role-submitted" },
    invoiceAcknowledged: { id: "e2e-job-execution-invoice-acknowledged" },
  },
  executionEvidence: {
    portalDocument: { id: "e2e-job-execution-evidence-portal-document" },
    portalAcknowledgement: { id: "e2e-job-execution-evidence-portal-acknowledgement" },
    technicianNote: { id: "e2e-job-execution-evidence-technician-note" },
  },
  servicePlans: {
    active: { id: "e2e-service-plan-active", name: "Quarterly Vehicle Health Check" },
    paused: { id: "e2e-service-plan-paused", name: "Annual Warranty Review" },
    portalRenewal: { id: "e2e-service-plan-portal-renewal", name: "Semi-Annual Compliance Review" },
    run: { id: "e2e-service-plan-run-executed" },
  },
  servicePlanRenewals: {
    portalPending: { id: "e2e-service-plan-renewal-portal-pending" },
  },
  servicePlanChangeRequests: {
    customerOpen: { id: "e2e-service-plan-request-customer-open" },
    operatorCompleted: { id: "e2e-service-plan-request-operator-completed" },
  },
  quotes: {
    draft: { id: "e2e-quote-draft", number: "Q-2026-00010", title: "Draft wheel restoration quote" },
    sent: { id: "e2e-quote-sent", number: "Q-2026-00011", title: "Portal-visible service quote" },
    approved: { id: "e2e-quote-approved", number: "Q-2026-00012", title: "Approved recurring conversion quote" },
  },
  revenueTasks: {
    overdueInvoice: { id: "e2e-revenue-task-overdue-invoice" },
  },
  compliance: {
    policies: {
      quoteApproval: { id: "e2e-sla-policy-quote-approval", name: "Quote approval response" },
      servicePlanExecution: { id: "e2e-sla-policy-service-plan-execution", name: "Service plan execution follow-through" },
    },
    events: {
      openServicePlan: { id: "e2e-sla-event-open-service-plan" },
      breachedQuote: { id: "e2e-sla-event-breached-quote" },
    },
    exceptions: {
      openManualOverride: { id: "e2e-compliance-exception-open-manual-override" },
      openEvidenceReview: { id: "e2e-compliance-exception-open-evidence-review" },
      resolvedInvoiceReview: { id: "e2e-compliance-exception-resolved-invoice-review" },
    },
  },
  performance: {
    periods: {
      current: { id: "e2e-performance-period-current", name: "E2E March Ops Window" },
    },
  },
  compensation: {
    rules: {
      technician: { id: "e2e-comp-rule-technician-jobs", name: "Technician completion bonus" },
    },
    runs: {
      technicianDraft: { id: "e2e-comp-run-technician-draft" },
    },
  },
  scheduling: {
    availabilityOperator: { id: "e2e-tech-availability-operator" },
    availabilityTechnician: { id: "e2e-tech-availability-technician" },
    exceptionReduced: { id: "e2e-tech-exception-reduced" },
    exceptionUnavailable: { id: "e2e-tech-exception-unavailable" },
  },
  inventory: {
    parts: {
      alloyKit: { id: "e2e-part-alloy-kit", sku: "E2E-ALLOY-KIT", name: "Alloy Repair Kit" },
      lacquer: { id: "e2e-part-lacquer", sku: "E2E-LACQUER", name: "Protective Lacquer" },
      bolts: { id: "e2e-part-wheel-bolts", sku: "E2E-BOLTS", name: "Wheel Bolt Set" },
    },
    locations: {
      warehouse: { id: "e2e-inventory-location-warehouse", name: "Main Warehouse" },
      van: { id: "e2e-inventory-location-van", name: "Technician Van 01" },
    },
    stocks: {
      alloyWarehouse: { id: "e2e-stock-alloy-warehouse" },
      lacquerWarehouse: { id: "e2e-stock-lacquer-warehouse" },
      boltsVan: { id: "e2e-stock-bolts-van" },
    },
    jobParts: {
      portalReserved: { id: "e2e-job-part-portal-reserved" },
      technicianDraft: { id: "e2e-job-part-technician-draft" },
      invoiceUsed: { id: "e2e-job-part-invoice-used" },
    },
    purchaseOrders: {
      open: { id: "e2e-po-open" },
    },
    purchaseOrderLines: {
      openLacquer: { id: "e2e-po-line-open-lacquer" },
    },
    movements: {
      reservePortal: { id: "e2e-stock-movement-reserve-portal" },
      useInvoice: { id: "e2e-stock-movement-use-invoice" },
      poReceiveSeed: { id: "e2e-stock-movement-po-receive-seed" },
    },
  },
};

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function setUtcTime(date, hours, minutes) {
  const value = new Date(date);
  value.setUTCHours(hours, minutes, 0, 0);
  return value;
}

async function ensureBookingBusinessHours(companyId) {
  const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    tenantId: companyId,
    dayOfWeek,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  }));

  await prisma.bookingBusinessHour.deleteMany({
    where: { tenantId: companyId },
  });

  await prisma.bookingBusinessHour.createMany({
    data: weekdayHours,
  });
}

function deriveIntegrationKey() {
  const secret =
    String(process.env.INTEGRATIONS_ENCRYPTION_KEY || "").trim() ||
    String(process.env.JWT_SECRET || "").trim() ||
    "dev_insecure_integrations_key";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSeedText(value) {
  const key = deriveIntegrationKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function artifactRoot() {
  return path.resolve(process.cwd(), process.env.ARTIFACTS_STORAGE_ROOT || "uploads/artifacts");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function writeSeedArtifact(companyId, entityType, entityId, fileName, contents) {
  const dir = path.join(artifactRoot(), companyId, entityType.toLowerCase(), entityId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(companyId, entityType.toLowerCase(), entityId, fileName);
  await fs.writeFile(path.join(artifactRoot(), storagePath), contents, "utf8");
  return storagePath;
}

async function ensurePlan() {
  const plan = await prisma.plan.upsert({
    where: { code: "SOLE_TRADER" },
    create: {
      id: "e2e-plan-sole-trader",
      code: "SOLE_TRADER",
      name: "E2E Sole Trader",
      stripePriceMonthlyId: "price_e2e_sole_trader_monthly",
      stripePriceAnnualId: "price_e2e_sole_trader_annual",
      aiRequestsLimitMonthly: 1000,
      aiTokensLimitMonthly: 100000,
      featuresJson: {
        seeded: true,
        liveBilling: false,
        bookings_enabled: true,
        accounting_enabled: true,
        payments_enabled: true,
        social_enabled: false,
        ai_enabled: true,
        completed_jobs_monthly_limit: 9999,
        completed_jobs_monthly_label: "E2E validation",
        extra_job_completion_packs_status: "coming_soon",
      },
    },
    update: {
      name: "E2E Sole Trader",
      stripePriceMonthlyId: "price_e2e_sole_trader_monthly",
      stripePriceAnnualId: "price_e2e_sole_trader_annual",
      aiRequestsLimitMonthly: 1000,
      aiTokensLimitMonthly: 100000,
      featuresJson: {
        seeded: true,
        liveBilling: false,
        bookings_enabled: true,
        accounting_enabled: true,
        payments_enabled: true,
        social_enabled: false,
        ai_enabled: true,
        completed_jobs_monthly_limit: 9999,
        completed_jobs_monthly_label: "E2E validation",
        extra_job_completion_packs_status: "coming_soon",
      },
    },
  });
  return plan.id;
}

async function ensureCompany() {
  return prisma.company.upsert({
    where: { id: FIXTURE.company.id },
    create: {
      id: FIXTURE.company.id,
      name: FIXTURE.company.name,
      timezone: FIXTURE.company.timezone,
      currency: FIXTURE.company.currency,
    },
    update: {
      name: FIXTURE.company.name,
      timezone: FIXTURE.company.timezone,
      currency: FIXTURE.company.currency,
    },
  });
}

async function ensureLocation(companyId, fixture, addressLine1, city) {
  return prisma.location.upsert({
    where: { id: fixture.id },
    create: {
      id: fixture.id,
      companyId,
      code: fixture.code,
      kind: fixture.kind,
      name: fixture.name,
      addressLine1,
      city,
      postalCode: "E20 1AA",
      country: "GB",
      timezone: "Europe/London",
      email: `${fixture.code.toLowerCase()}@mytitan.local`,
    },
    update: {
      companyId,
      code: fixture.code,
      kind: fixture.kind,
      name: fixture.name,
      addressLine1,
      city,
      postalCode: "E20 1AA",
      country: "GB",
      timezone: "Europe/London",
      email: `${fixture.code.toLowerCase()}@mytitan.local`,
    },
  });
}

async function ensureLocations(companyId) {
  const hq = await ensureLocation(companyId, FIXTURE.locations.hq, "1 E2E Way", "London");
  const north = await ensureLocation(companyId, FIXTURE.locations.north, "88 E2E North Way", "Manchester");
  return { hq, north };
}

async function ensureLocationMembership(companyId, locationId, userId, roleOverride = null) {
  await prisma.locationMembership.upsert({
    where: {
      tenantId_userId_locationId: {
        tenantId: companyId,
        userId,
        locationId,
      },
    },
    create: {
      tenantId: companyId,
      userId,
      locationId,
      roleOverride,
      active: true,
    },
    update: {
      roleOverride,
      active: true,
    },
  });
}

async function ensureOperator(companyId, locationId) {
  return ensureWorkspaceUser(companyId, locationId, FIXTURE.operator);
}

async function ensureWorkspaceUser(companyId, locationId, fixture) {
  const passwordHash = await bcrypt.hash(fixture.password, 10);
  const user = await prisma.user.upsert({
    where: { id: fixture.id },
    create: {
      id: fixture.id,
      companyId,
      email: fixture.email,
      emailVerified: fixture.emailVerified === false ? false : true,
      passwordHash,
      role: fixture.role,
      defaultLocationId: locationId,
      lastActiveAt: new Date(),
      lastLoginAt: new Date(),
    },
    update: {
      companyId,
      email: fixture.email,
      emailVerified: fixture.emailVerified === false ? false : true,
      passwordHash,
      role: fixture.role,
      defaultLocationId: locationId,
      lastActiveAt: new Date(),
    },
  });

  await prisma.locationStaffAssignment.upsert({
    where: { locationId_userId: { locationId, userId: user.id } },
    create: {
      companyId,
      locationId,
      userId: user.id,
    },
    update: {
      companyId,
    },
  });
  await ensureLocationMembership(companyId, locationId, user.id);

  return user;
}

async function ensurePlatformAdminUser(companyId, locationId) {
  const fixture = FIXTURE.platformAdmin;
  const email = String(fixture.email).trim().toLowerCase();
  const staleEmail = String(fixture.staleEmail || "").trim().toLowerCase();
  const passwordHash = await bcrypt.hash(fixture.password, 10);
  async function neutralizeUser(row) {
    if (!row?.id) return;
    await prisma.user.update({
      where: { id: row.id },
      data: {
        email: `neutralized-${row.id}@mytitan.invalid`,
        emailVerified: false,
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    });
  }
  async function neutralizeOtherPrincipalAdmins(activeUserId) {
    const duplicates = await prisma.user.findMany({
      where: {
        email,
        id: { not: activeUserId },
      },
      select: { id: true },
    });
    for (const duplicate of duplicates) {
      await neutralizeUser(duplicate);
    }
  }
  const intended = await prisma.user.findFirst({ where: { companyId, email } });
  const stale = staleEmail
    ? await prisma.user.findFirst({
        where: {
          companyId,
          OR: [{ id: fixture.id }, { email: staleEmail }],
        },
      })
    : await prisma.user.findFirst({ where: { companyId, id: fixture.id } });

  const activeData = {
    companyId,
    email,
    emailVerified: true,
    passwordHash,
    role: fixture.role,
    isActive: true,
    defaultLocationId: locationId,
    lastActiveAt: new Date(),
  };

  if (intended) {
    const user = await prisma.user.update({
      where: { id: intended.id },
      data: activeData,
    });
    if (stale && stale.id !== intended.id) {
      await neutralizeUser(stale);
    }
    await neutralizeOtherPrincipalAdmins(user.id);
    return user;
  }

  if (stale) {
    const user = await prisma.user.update({
      where: { id: stale.id },
      data: activeData,
    });
    await neutralizeOtherPrincipalAdmins(user.id);
    return user;
  }

  const user = await prisma.user.create({
    data: {
      id: fixture.id,
      ...activeData,
      lastLoginAt: new Date(),
    },
  });
  await neutralizeOtherPrincipalAdmins(user.id);
  return user;
}

async function ensureInvoiceCounter(companyId) {
  const year = new Date().getUTCFullYear();
  await prisma.invoiceCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: {
      companyId,
      year,
      current: 12,
    },
    update: {},
  });
}

async function ensureTenantSettings(companyId, defaultLocationId, planId) {
  const token = "e2e-booking-public-token";
  const icsToken = "e2e-booking-ics-token";
  await prisma.tenantSetting.upsert({
    where: { tenantId: companyId },
    create: {
      tenantId: companyId,
      planId,
      companyName: FIXTURE.company.name,
      defaultLocationId,
      defaultCurrency: "GBP",
      defaultTimezone: "UTC",
      bookingsEnabled: true,
      paymentsEnabled: true,
      featureBookings: true,
      featureAccounting: true,
      featureCustomerPortal: true,
      featurePayments: true,
      accountingEnabled: true,
      bookingPublicEnabled: true,
      autoConfirmPublicBookings: true,
      bookingPublicToken: token,
      bookingIcsToken: icsToken,
      guidedSetupCurrentStep: 0,
      guidedSetupCompletedSteps: [],
      guidedSetupSkippedSteps: [],
      guidedSetupCompletedAt: null,
      onboardingCompleted: true,
      onboardingStep: 5,
      brandPrimaryColor: "#4fd1c5",
      supportPhone: "+44 20 7946 0101",
      primaryTrade: "WHEELS",
      businessConfigJson: {
        defaults: { commandCentreVersion: "v2" },
        navigation: { showIntelligence: true, showPortalOps: true, showTechnicianQueue: true },
        compliance: {
          requireExecutionEvidenceForCompletedJobs: true,
          executionAcknowledgementThresholdHours: 24,
        },
        analytics: {
          defaultWindowDays: 30,
          widgetOrder: ["executive-summary", "pressure-panel", "revenue-panel", "capacity-panel", "benchmark-delta"],
          hiddenWidgets: [],
        },
        workflowStages: {
          bookings: [
            { id: "lead", label: "Lead Intake", statuses: ["PENDING", "PLANNED"], visible: true },
            { id: "scheduled", label: "Confirmed Visit", statuses: ["CONFIRMED"], visible: true, requiredCustomFieldKeys: ["booking_source"], requiredFieldEnforcementMode: "block" },
            { id: "working", label: "On Site", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Finished", statuses: ["COMPLETED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
          jobs: [
            { id: "ready", label: "Ready for Dispatch", statuses: ["OPEN"], visible: true, requiredCustomFieldKeys: ["serial_number"], requiredFieldEnforcementMode: "block" },
            { id: "scheduled", label: "Booked In", statuses: ["SCHEDULED"], visible: true },
            { id: "in_progress", label: "Work Underway", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Ready to Bill", statuses: ["COMPLETED", "INVOICED"], visible: true, requiredCustomFieldKeys: ["warranty_status"], requiredFieldEnforcementMode: "block" },
            { id: "cancelled", label: "Closed Out", statuses: ["CANCELLED"], visible: true },
          ],
          technician: [
            { id: "dispatch", label: "Awaiting Arrival", statuses: ["OPEN", "SCHEDULED"], visible: true, requiredCustomFieldKeys: ["certification"] },
            { id: "working", label: "Working On Site", statuses: ["IN_PROGRESS"], visible: true, requiredCustomFieldKeys: ["certification"], requiredFieldEnforcementMode: "block" },
            { id: "finished", label: "Field Complete", statuses: ["COMPLETED", "INVOICED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
        },
      },
    },
    update: {
      planId,
      companyName: FIXTURE.company.name,
      defaultLocationId,
      defaultCurrency: "GBP",
      defaultTimezone: "UTC",
      bookingsEnabled: true,
      paymentsEnabled: true,
      featureBookings: true,
      featureAccounting: true,
      featureCustomerPortal: true,
      featurePayments: true,
      accountingEnabled: true,
      bookingPublicEnabled: true,
      autoConfirmPublicBookings: true,
      bookingPublicToken: token,
      bookingIcsToken: icsToken,
      guidedSetupCurrentStep: 0,
      guidedSetupCompletedSteps: [],
      guidedSetupSkippedSteps: [],
      guidedSetupCompletedAt: null,
      onboardingCompleted: true,
      onboardingStep: 5,
      brandPrimaryColor: "#4fd1c5",
      supportPhone: "+44 20 7946 0101",
      primaryTrade: "WHEELS",
      businessConfigJson: {
        defaults: { commandCentreVersion: "v2" },
        navigation: { showIntelligence: true, showPortalOps: true, showTechnicianQueue: true },
        compliance: {
          requireExecutionEvidenceForCompletedJobs: true,
          executionAcknowledgementThresholdHours: 24,
        },
        analytics: {
          defaultWindowDays: 30,
          widgetOrder: ["executive-summary", "pressure-panel", "revenue-panel", "capacity-panel", "benchmark-delta"],
          hiddenWidgets: [],
        },
        workflowStages: {
          bookings: [
            { id: "lead", label: "Lead Intake", statuses: ["PENDING", "PLANNED"], visible: true },
            { id: "scheduled", label: "Confirmed Visit", statuses: ["CONFIRMED"], visible: true, requiredCustomFieldKeys: ["booking_source"], requiredFieldEnforcementMode: "block" },
            { id: "working", label: "On Site", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Finished", statuses: ["COMPLETED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
          jobs: [
            { id: "ready", label: "Ready for Dispatch", statuses: ["OPEN"], visible: true, requiredCustomFieldKeys: ["serial_number"], requiredFieldEnforcementMode: "block" },
            { id: "scheduled", label: "Booked In", statuses: ["SCHEDULED"], visible: true },
            { id: "in_progress", label: "Work Underway", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Ready to Bill", statuses: ["COMPLETED", "INVOICED"], visible: true, requiredCustomFieldKeys: ["warranty_status"], requiredFieldEnforcementMode: "block" },
            { id: "cancelled", label: "Closed Out", statuses: ["CANCELLED"], visible: true },
          ],
          technician: [
            { id: "dispatch", label: "Awaiting Arrival", statuses: ["OPEN", "SCHEDULED"], visible: true, requiredCustomFieldKeys: ["certification"] },
            { id: "working", label: "Working On Site", statuses: ["IN_PROGRESS"], visible: true, requiredCustomFieldKeys: ["certification"], requiredFieldEnforcementMode: "block" },
            { id: "finished", label: "Field Complete", statuses: ["COMPLETED", "INVOICED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
        },
      },
    },
  });
}

async function ensureTenantSubscription(companyId, planId) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await prisma.tenantSubscription.upsert({
    where: { tenantId: companyId },
    create: {
      tenant: { connect: { id: companyId } },
      plan: { connect: { id: planId } },
      status: "trialing",
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
    },
    update: {
      plan: { connect: { id: planId } },
      status: "trialing",
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    },
  });
}

async function ensurePlatformBillingCatalogFixtures(platformAdminUserId) {
  const overrideKey = "job_pack:job_completion_pack_3:none";
  const pack3ProductId = process.env.STRIPE_JOB_COMPLETION_PACK_3_PRODUCT_ID || "prod_e2e_job_pack_50";
  const pack3PriceId = process.env.STRIPE_JOB_COMPLETION_PACK_3_PRICE_ID || "price_e2e_job_pack_50";
  await prisma.billingCatalogOverride.upsert({
    where: { key: overrideKey },
    create: {
      key: overrideKey,
      kind: "job_pack",
      code: "job_completion_pack_3",
      lookupKey: "job_completion_pack_3",
      stripeProductId: pack3ProductId,
      stripePriceId: pack3PriceId,
      expectedAmountCents: 2500,
      currency: "GBP",
      active: true,
      state: "active",
      verificationStatus: "ready",
      verificationMessage: "Validated against the configured Stripe mapping without enabling checkout.",
      changeNotes: "Seeded ready mapping for internal platform review coverage.",
      createdByUserId: platformAdminUserId,
      updatedByUserId: platformAdminUserId,
      metadataJson: {
        verification: {
          status: "ready",
          message: "Validated against the configured Stripe mapping without enabling checkout.",
          observed: {
            observedAmountCents: 2500,
            observedCurrency: "GBP",
            observedLookupKey: "job_completion_pack_3",
          },
        },
      },
    },
    update: {
      lookupKey: "job_completion_pack_3",
      stripeProductId: pack3ProductId,
      stripePriceId: pack3PriceId,
      expectedAmountCents: 2500,
      currency: "GBP",
      active: true,
      state: "active",
      verificationStatus: "ready",
      verificationMessage: "Validated against the configured Stripe mapping without enabling checkout.",
      changeNotes: "Seeded ready mapping for internal platform review coverage.",
      updatedByUserId: platformAdminUserId,
      metadataJson: {
        verification: {
          status: "ready",
          message: "Validated against the configured Stripe mapping without enabling checkout.",
        },
      },
    },
  });

  await prisma.billingCatalogOverrideHistory.createMany({
    data: [
      {
        id: "e2e-billing-catalog-history-created",
        overrideKey,
        kind: "job_pack",
        code: "job_completion_pack_3",
        interval: null,
        action: "created",
        changeNotes: "Seeded baseline catalog mapping.",
        nextValuesJson: {
          lookupKey: "job_completion_pack_3",
          stripeProductIdMasked: "prod_e••••_50",
          stripePriceIdMasked: "price_••••_50",
          expectedAmountCents: 2500,
          currency: "GBP",
          active: true,
          verificationStatus: "ready",
        },
        metadataJson: {
          verification: {
            status: "ready",
            message: "Validated against Stripe safely before saving.",
          },
        },
        createdByUserId: platformAdminUserId,
      },
      {
        id: "e2e-billing-catalog-history-updated",
        overrideKey,
        kind: "job_pack",
        code: "job_completion_pack_3",
        interval: null,
        action: "updated",
        changeNotes: "Seeded ready mapping for platform review coverage.",
        previousValuesJson: {
          expectedAmountCents: 2500,
          currency: "GBP",
          verificationStatus: "ready",
        },
        nextValuesJson: {
          expectedAmountCents: 2500,
          currency: "GBP",
          verificationStatus: "ready",
        },
        metadataJson: {
          verification: {
            status: "ready",
            message: "Validated against the configured Stripe mapping without enabling checkout.",
          },
        },
        createdByUserId: platformAdminUserId,
      },
    ],
    skipDuplicates: true,
  });
}

async function ensurePlatformSafeErrorLogs(platformAdminUserId) {
  const rows = [
    {
      id: "e2e-safe-log-validation-open",
      category: "validation",
      area: "stable validator",
      summary: "Validation-only retry noise was recorded during stable-suite rehearsal.",
      severity: "warning",
      status: "open",
      occurrenceCount: 2,
      clearable: true,
      validationOnly: true,
      auditProtected: false,
      sanitizedDetailsJson: {
        affectedArea: "e2e validator",
        safeCategory: "validation",
        firstSeenReason: "seeded rehearsal failure",
      },
    },
    {
      id: "e2e-safe-log-billing-reviewed",
      category: "billing catalog",
      area: "product mapping",
      summary: "Job completion pack mapping mismatch was reviewed and is safe to clear after sign-off.",
      severity: "warning",
      status: "reviewed",
      occurrenceCount: 1,
      clearable: true,
      validationOnly: false,
      auditProtected: false,
      reviewedAt: new Date(),
      reviewedByUserId: platformAdminUserId,
      sanitizedDetailsJson: {
        affectedArea: "job completion pack 50",
        safeCategory: "billing catalog",
      },
    },
    {
      id: "e2e-safe-log-webhook-protected",
      category: "webhook",
      area: "idempotency ledger",
      summary: "Protected webhook receipt retained for audit and duplicate-protection review.",
      severity: "critical",
      status: "open",
      occurrenceCount: 1,
      clearable: false,
      validationOnly: false,
      auditProtected: true,
      sanitizedDetailsJson: {
        affectedArea: "webhook idempotency",
        safeCategory: "webhook",
        retention: "protected",
      },
    },
  ];

  for (const row of rows) {
    await prisma.platformSafeErrorLog.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }
}

async function ensureInternalSupportWorkspace(planId) {
  const supportEmail = FIXTURE.supportAccount.user.email;
  const passwordHash = await bcrypt.hash(FIXTURE.supportAccount.user.password, 10);

  await prisma.user.deleteMany({
    where: {
      email: supportEmail,
      id: { not: FIXTURE.supportAccount.user.id },
    },
  });

  const company = await prisma.company.upsert({
    where: { id: FIXTURE.supportAccount.company.id },
    create: {
      id: FIXTURE.supportAccount.company.id,
      name: FIXTURE.supportAccount.company.name,
      timezone: FIXTURE.supportAccount.company.timezone,
      currency: FIXTURE.supportAccount.company.currency,
    },
    update: {
      name: FIXTURE.supportAccount.company.name,
      timezone: FIXTURE.supportAccount.company.timezone,
      currency: FIXTURE.supportAccount.company.currency,
    },
  });

  await prisma.user.upsert({
    where: { id: FIXTURE.supportAccount.user.id },
    create: {
      id: FIXTURE.supportAccount.user.id,
      companyId: company.id,
      email: supportEmail,
      emailVerified: true,
      passwordHash,
      role: FIXTURE.supportAccount.user.role,
      lastActiveAt: new Date(),
      lastLoginAt: new Date(),
    },
    update: {
      companyId: company.id,
      email: supportEmail,
      emailVerified: true,
      passwordHash,
      role: FIXTURE.supportAccount.user.role,
      lastActiveAt: new Date(),
    },
  });

  await prisma.tenantSetting.upsert({
    where: { tenantId: company.id },
    create: {
      tenantId: company.id,
      planId,
      companyName: company.name,
      defaultCurrency: company.currency,
      defaultTimezone: company.timezone,
      onboardingCompleted: true,
    },
    update: {
      planId,
      companyName: company.name,
      defaultCurrency: company.currency,
      defaultTimezone: company.timezone,
      onboardingCompleted: true,
    },
  });

  await prisma.tenantSubscription.upsert({
    where: { tenantId: company.id },
    create: {
      tenant: { connect: { id: company.id } },
      plan: { connect: { id: planId } },
      status: "active",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    update: {
      plan: { connect: { id: planId } },
      status: "active",
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    },
  });
}

async function ensureAutomations(companyId) {
  await prisma.automationSuggestionState.deleteMany({
    where: { tenantId: companyId },
  });

  await prisma.automationRule.deleteMany({
    where: {
      tenantId: companyId,
      id: {
        notIn: ["e2e-rule-booking-dispatch", "e2e-rule-sla-breached", "e2e-rule-compliance-exception"],
      },
    },
  });

  await prisma.automationsSetting.upsert({
    where: { tenantId: companyId },
    create: {
      tenantId: companyId,
      configJson: {
        jobCompletionFollowUpEnabled: true,
        reviewRequestEnabled: true,
      },
    },
    update: {
      configJson: {
        jobCompletionFollowUpEnabled: true,
        reviewRequestEnabled: true,
      },
    },
  });

  await prisma.automationRule.upsert({
    where: { id: "e2e-rule-booking-dispatch" },
    create: {
      id: "e2e-rule-booking-dispatch",
      tenantId: companyId,
      name: "E2E dispatch review on conversion",
      trigger: "booking.converted",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Dispatch review needed",
        body: "Converted booking should be reviewed by dispatch.",
      },
    },
    update: {
      tenantId: companyId,
      name: "E2E dispatch review on conversion",
      trigger: "booking.converted",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Dispatch review needed",
        body: "Converted booking should be reviewed by dispatch.",
      },
    },
  });

  await prisma.automationRule.upsert({
    where: { id: "e2e-rule-sla-breached" },
    create: {
      id: "e2e-rule-sla-breached",
      tenantId: companyId,
      name: "E2E SLA breach escalation",
      trigger: "sla.breached",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Workflow SLA breached",
        body: "Review the affected workflow entity and decide on the next operator action.",
      },
    },
    update: {
      tenantId: companyId,
      name: "E2E SLA breach escalation",
      trigger: "sla.breached",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Workflow SLA breached",
        body: "Review the affected workflow entity and decide on the next operator action.",
      },
    },
  });

  await prisma.automationRule.upsert({
    where: { id: "e2e-rule-compliance-exception" },
    create: {
      id: "e2e-rule-compliance-exception",
      tenantId: companyId,
      name: "E2E compliance exception escalation",
      trigger: "compliance.exception_created",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Compliance exception created",
        body: "An operator should review the new compliance exception queue item.",
      },
    },
    update: {
      tenantId: companyId,
      name: "E2E compliance exception escalation",
      trigger: "compliance.exception_created",
      enabled: true,
      conditionJson: null,
      actionJson: {
        type: "send_internal_notification",
        title: "Compliance exception created",
        body: "An operator should review the new compliance exception queue item.",
      },
    },
  });
}

async function ensureService(companyId) {
  return prisma.serviceCatalogItem.upsert({
    where: { tenantId_key: { tenantId: companyId, key: FIXTURE.service.key } },
    create: {
      id: FIXTURE.service.id,
      tenantId: companyId,
      key: FIXTURE.service.key,
      name: FIXTURE.service.name,
      unitPrice: 145,
      defaultQty: 1,
      durationMinutes: 90,
      capacity: 1,
      active: true,
      vatEligible: true,
    },
    update: {
      name: FIXTURE.service.name,
      unitPrice: 145,
      durationMinutes: 90,
      capacity: 1,
      active: true,
      vatEligible: true,
    },
  });
}

async function ensureCustomers(companyId, locationIds) {
  const customers = {};
  for (const [key, value] of Object.entries(FIXTURE.customers)) {
    const homeLocationId = ["open", "blocked", "financeOps"].includes(key) ? locationIds.north : locationIds.hq;
    customers[key] = await prisma.customer.upsert({
      where: { companyId_slug: { companyId, slug: value.slug } },
      create: {
        id: value.id,
        companyId,
        homeLocationId,
        slug: value.slug,
        name: value.name,
        email: value.email,
        phone: value.phone,
      },
      update: {
        homeLocationId,
        name: value.name,
        email: value.email,
        phone: value.phone,
      },
    });
  }
  return customers;
}

async function ensureJob({ companyId, locationId, userId, customerId, jobId, jobRef, status, customerName, customerEmail, customerPhone, totalCents, scheduledAt, completedAt, invoiceIssuedAt, invoiceDueAt, invoicePaidAt, approvedAt, approvedByName, signedAt, signatureName, signatureDataUrl, paymentLinkUrl, paymentReceiptUrl, invoicePdfUrl, paymentCheckoutSessionId, serviceName, vehicleMake, vehicleModel, vehicleReg, formData, whatsappCompletionLink, assignedUserId, customerJourneyStage, customerFacingStatus, customerFacingStatusUpdatedAt, customerEtaWindowStart, customerEtaWindowEnd, customerEtaDurationMinutes, customerEtaConfidence, customerEtaStatus, customerEtaNote, customerEtaUpdatedAt, customerEtaUpdatedByUserId, customerTechnicianNameVisible }) {
  return prisma.job.upsert({
    where: { companyId_jobRef: { companyId, jobRef } },
    create: {
      id: jobId,
      companyId,
      locationId,
      customerId,
      jobRef,
      status,
      customerName,
      customerEmail,
      customerPhone,
      currency: "GBP",
      laborCents: totalCents - 12000,
      partsCents: 8000,
      miscCents: 4000,
      subtotalCents: totalCents - 10000,
      taxRateBps: 2000,
      taxCents: 10000,
      totalCents,
      scheduledAt,
      completedAt,
      invoiceIssuedAt,
      invoiceDueAt,
      invoicePaidAt,
      approvedAt,
      approvedByName,
      signedAt,
      signatureName,
      signatureDataUrl,
      paymentLinkUrl,
      paymentReceiptUrl,
      invoicePdfUrl,
      paymentCheckoutSessionId,
      serviceName,
      vehicleMake,
      vehicleModel,
      vehicleReg,
      formData,
      whatsappCompletionLink,
      assignedUserId: assignedUserId || null,
      customerJourneyStage: customerJourneyStage || null,
      customerFacingStatus: customerFacingStatus || null,
      customerFacingStatusUpdatedAt: customerFacingStatusUpdatedAt || null,
      customerEtaWindowStart: customerEtaWindowStart || null,
      customerEtaWindowEnd: customerEtaWindowEnd || null,
      customerEtaDurationMinutes: customerEtaDurationMinutes || null,
      customerEtaConfidence: customerEtaConfidence || null,
      customerEtaStatus: customerEtaStatus || null,
      customerEtaNote: customerEtaNote || null,
      customerEtaUpdatedAt: customerEtaUpdatedAt || null,
      customerEtaUpdatedByUserId: customerEtaUpdatedByUserId || null,
      customerTechnicianNameVisible: Boolean(customerTechnicianNameVisible),
      createdByUserId: userId,
      createdAt: addMinutes(new Date(), -240),
    },
    update: {
      locationId,
      customerId,
      status,
      customerName,
      customerEmail,
      customerPhone,
      currency: "GBP",
      laborCents: totalCents - 12000,
      partsCents: 8000,
      miscCents: 4000,
      subtotalCents: totalCents - 10000,
      taxRateBps: 2000,
      taxCents: 10000,
      totalCents,
      scheduledAt,
      completedAt,
      invoiceIssuedAt,
      invoiceDueAt,
      invoicePaidAt,
      approvedAt,
      approvedByName,
      signedAt,
      signatureName,
      signatureDataUrl,
      paymentLinkUrl,
      paymentReceiptUrl,
      invoicePdfUrl,
      paymentCheckoutSessionId,
      serviceName,
      vehicleMake,
      vehicleModel,
      vehicleReg,
      formData,
      whatsappCompletionLink,
      assignedUserId: assignedUserId || null,
      customerJourneyStage: customerJourneyStage || null,
      customerFacingStatus: customerFacingStatus || null,
      customerFacingStatusUpdatedAt: customerFacingStatusUpdatedAt || null,
      customerEtaWindowStart: customerEtaWindowStart || null,
      customerEtaWindowEnd: customerEtaWindowEnd || null,
      customerEtaDurationMinutes: customerEtaDurationMinutes || null,
      customerEtaConfidence: customerEtaConfidence || null,
      customerEtaStatus: customerEtaStatus || null,
      customerEtaNote: customerEtaNote || null,
      customerEtaUpdatedAt: customerEtaUpdatedAt || null,
      customerEtaUpdatedByUserId: customerEtaUpdatedByUserId || null,
      customerTechnicianNameVisible: Boolean(customerTechnicianNameVisible),
      createdByUserId: userId,
    },
  });
}

async function ensureJobActivity(companyId, jobId, actorUserId, id, eventType, message, createdAt, payloadJson = null) {
  await prisma.jobActivity.upsert({
    where: { id },
    create: {
      id,
      companyId,
      jobId,
      actorUserId,
      eventType,
      message,
      createdAt,
      payloadJson,
    },
    update: {
      companyId,
      jobId,
      actorUserId,
      eventType,
      message,
      createdAt,
      payloadJson,
    },
  });
}

async function ensureReminder(id, companyId, jobId, remindAt, note, completedAt = null) {
  await prisma.jobReminder.upsert({
    where: { id },
    create: {
      id,
      companyId,
      jobId,
      remindAt,
      note,
      completedAt,
    },
    update: {
      remindAt,
      note,
      completedAt,
    },
  });
}

async function ensurePublicToken(token, jobId, expiresAt) {
  await prisma.publicJobToken.upsert({
    where: { token },
    create: {
      jobId,
      token,
      expiresAt,
    },
    update: {
      jobId,
      expiresAt,
    },
  });
}

async function ensureActivityEvent(id, payload) {
  await prisma.activityEvent.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureApiToken(companyId, userId) {
  const token = `${"mtit"}_${FIXTURE.integrations.apiToken.publicId}_${FIXTURE.integrations.apiToken.secret}`;
  await prisma.apiToken.upsert({
    where: { id: FIXTURE.integrations.apiToken.id },
    create: {
      id: FIXTURE.integrations.apiToken.id,
      tenantId: companyId,
      name: FIXTURE.integrations.apiToken.name,
      publicId: FIXTURE.integrations.apiToken.publicId,
      tokenPrefix: `mtit_${FIXTURE.integrations.apiToken.publicId}`,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdByUserId: userId,
      lastUsedAt: addMinutes(new Date(), -20),
    },
    update: {
      tenantId: companyId,
      name: FIXTURE.integrations.apiToken.name,
      tokenPrefix: `mtit_${FIXTURE.integrations.apiToken.publicId}`,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdByUserId: userId,
      revokedAt: null,
      lastUsedAt: addMinutes(new Date(), -20),
    },
  });
}

async function ensurePersonalGoogleConnection(companyId, userId) {
  const encryptedAccess = encryptSeedText("google-access-seeded-token");
  const encryptedRefresh = encryptSeedText("google-refresh-seeded-token");
  return prisma.integrationConnection.upsert({
    where: {
      tenantId_provider_scope_scopeOwnerKey: {
        tenantId: companyId,
        provider: "GOOGLE_CALENDAR",
        scope: "USER",
        scopeOwnerKey: userId,
      },
    },
    create: {
      id: FIXTURE.integrations.googleCalendar.id,
      tenantId: companyId,
      provider: "GOOGLE_CALENDAR",
      scope: "USER",
      scopeOwnerKey: userId,
      ownerUserId: userId,
      status: "connected",
      accessTokenEncrypted: encryptedAccess,
      refreshTokenEncrypted: encryptedRefresh,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      connectedAt: addMinutes(new Date(), -45),
    },
    update: {
      tenantId: companyId,
      provider: "GOOGLE_CALENDAR",
      scope: "USER",
      scopeOwnerKey: userId,
      ownerUserId: userId,
      status: "connected",
      accessTokenEncrypted: encryptedAccess,
      refreshTokenEncrypted: encryptedRefresh,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      connectedAt: addMinutes(new Date(), -45),
    },
  });
}

async function ensureByogCredential(input) {
  return prisma.integrationCredential.upsert({
    where: {
      tenantId_provider_scope_scopeOwnerKey: {
        tenantId: input.tenantId,
        provider: input.provider,
        scope: input.scope,
        scopeOwnerKey: input.scopeOwnerKey,
      },
    },
    create: input,
    update: input,
  });
}

async function ensureWebhookEndpoint(companyId, userId) {
  return prisma.webhookEndpoint.upsert({
    where: { id: FIXTURE.integrations.webhook.id },
    create: {
      id: FIXTURE.integrations.webhook.id,
      tenantId: companyId,
      name: FIXTURE.integrations.webhook.name,
      url: FIXTURE.integrations.webhook.url,
      active: true,
      createdByUserId: userId,
      secretEncrypted: encryptSeedText(FIXTURE.integrations.webhook.secret),
      secretLastFour: FIXTURE.integrations.webhook.secret.slice(-4),
      subscribedEventTypes: FIXTURE.integrations.webhook.subscribedEventTypes,
      lastDeliveryAt: addMinutes(new Date(), -9),
      lastSuccessAt: addMinutes(new Date(), -25),
    },
    update: {
      tenantId: companyId,
      name: FIXTURE.integrations.webhook.name,
      url: FIXTURE.integrations.webhook.url,
      active: true,
      createdByUserId: userId,
      secretEncrypted: encryptSeedText(FIXTURE.integrations.webhook.secret),
      secretLastFour: FIXTURE.integrations.webhook.secret.slice(-4),
      subscribedEventTypes: FIXTURE.integrations.webhook.subscribedEventTypes,
      lastDeliveryAt: addMinutes(new Date(), -9),
      lastSuccessAt: addMinutes(new Date(), -25),
    },
  });
}

async function ensureWebhookDelivery(id, payload) {
  await prisma.webhookDelivery.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureDocumentArtifact(id, payload) {
  await prisma.documentArtifact.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureJobExecutionRecord(id, payload) {
  await prisma.jobExecutionRecord.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureJobExecutionEvidence(id, payload) {
  await prisma.jobExecutionEvidence.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureCustomerAccount(id, payload) {
  await prisma.customerAccount.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureCustomerApproval(id, payload) {
  await prisma.customerApproval.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureServicePlan(id, payload, tasks = []) {
  await prisma.servicePlan.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
  await prisma.servicePlanTask.deleteMany({ where: { planId: id } });
  if (tasks.length) {
    await prisma.servicePlanTask.createMany({
      data: tasks.map((task, index) => ({
        planId: id,
        title: task.title,
        description: task.description || null,
        sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : index,
        metadataJson: task.metadataJson || null,
      })),
    });
  }
}

async function ensureServicePlanRun(id, payload) {
  await prisma.servicePlanRun.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureServicePlanRenewal(id, payload) {
  await prisma.servicePlanRenewal.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureServicePlanChangeRequest(id, payload) {
  await prisma.servicePlanChangeRequest.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureQuote(id, payload, lineItems = []) {
  await prisma.quote.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
  await prisma.quoteLineItem.deleteMany({ where: { quoteId: id } });
  if (lineItems.length) {
    await prisma.quoteLineItem.createMany({
      data: lineItems.map((item, index) => ({
        quoteId: id,
        sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
        type: item.type,
        title: item.title,
        description: item.description || null,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.totalPriceCents,
        metadataJson: item.metadataJson || null,
      })),
    });
  }
}

async function ensureRevenueCollectionTask(id, payload) {
  await prisma.revenueCollectionTask.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensurePerformancePeriod(id, payload) {
  await prisma.performancePeriod.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureCompensationRule(id, payload) {
  await prisma.compensationRule.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureCompensationRun(id, payload) {
  await prisma.compensationRun.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureTechScheduleSetting(companyId, technicianId, weeklyJson) {
  return prisma.techScheduleSetting.upsert({
    where: {
      companyId_technicianId: {
        companyId,
        technicianId,
      },
    },
    create: {
      companyId,
      technicianId,
      weeklyJson,
    },
    update: {
      weeklyJson,
    },
  });
}

async function ensureTechnicianAvailability(id, payload) {
  await prisma.technicianAvailability.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureTechnicianCapacityException(id, payload) {
  await prisma.technicianCapacityException.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureStockItem(id, payload) {
  await prisma.stockItem.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureInventoryLocation(id, payload) {
  await prisma.inventoryLocation.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureInventoryStock(id, payload) {
  await prisma.inventoryStock.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureTechnicianStockAssignment(id, payload) {
  await prisma.technicianStockAssignment.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureEnterpriseFeatureFlag(id, payload) {
  await prisma.enterpriseFeatureFlag.upsert({
    where: { key_tenantId_environment: { key: payload.key, tenantId: payload.tenantId || null, environment: payload.environment || "all" } },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureJobPart(id, payload) {
  await prisma.jobPart.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureStockMovement(id, payload) {
  await prisma.stockMovement.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
}

async function ensureStockPurchaseOrder(id, payload, lines = []) {
  await prisma.stockPurchaseOrder.upsert({
    where: { id },
    create: { id, ...payload },
    update: payload,
  });
  await prisma.stockPOLine.deleteMany({ where: { poId: id } });
  if (lines.length) {
    await prisma.stockPOLine.createMany({
      data: lines.map((line) => ({
        ...line,
        poId: id,
      })),
    });
  }
}

async function ensureCustomField(companyId, field) {
  return prisma.customField.upsert({
    where: {
      tenantId_entityType_key: {
        tenantId: companyId,
        entityType: field.entityType,
        key: field.key,
      },
    },
    create: {
      id: field.id,
      tenantId: companyId,
      entityType: field.entityType,
      key: field.key,
      label: field.label,
      type: field.type,
      optionsJson: field.optionsJson || null,
      visible: true,
    },
    update: {
      label: field.label,
      type: field.type,
      optionsJson: field.optionsJson || null,
      visible: true,
    },
  });
}

async function ensureCustomFieldValue(companyId, fieldId, entityType, entityId, valueJson) {
  return prisma.customFieldValue.upsert({
    where: {
      fieldId_entityId: {
        fieldId,
        entityId,
      },
    },
    create: {
      tenantId: companyId,
      fieldId,
      entityType,
      entityId,
      valueJson,
    },
    update: {
      valueJson,
    },
  });
}

async function ensureSavedViews(companyId, userId) {
  await prisma.savedBoardView.updateMany({
    where: { companyId, userId },
    data: { isDefault: false },
  });
  await prisma.savedCommandView.updateMany({
    where: { companyId, userId },
    data: { isDefault: false },
  });

  await prisma.savedBoardView.upsert({
    where: { id: FIXTURE.boardView.id },
    create: {
      id: FIXTURE.boardView.id,
      companyId,
      userId,
      name: FIXTURE.boardView.name,
      viewType: "list",
      filtersJson: { search: "E2E", status: "", locationIds: ["all"], viewType: "list" },
      isDefault: true,
    },
    update: {
      name: FIXTURE.boardView.name,
      viewType: "list",
      filtersJson: { search: "E2E", status: "", locationIds: ["all"], viewType: "list" },
      isDefault: true,
    },
  });

  await prisma.savedCommandView.upsert({
    where: { id: FIXTURE.commandView.id },
    create: {
      id: FIXTURE.commandView.id,
      companyId,
      userId,
      name: FIXTURE.commandView.name,
      filtersJson: { search: "E2E", status: "", locationIds: ["all"], viewMode: "list" },
      isDefault: true,
    },
    update: {
      name: FIXTURE.commandView.name,
      filtersJson: { search: "E2E", status: "", locationIds: ["all"], viewMode: "list" },
      isDefault: true,
    },
  });
}

async function resetCustomFields(companyId) {
  const baselineIds = Object.values(FIXTURE.customFields).map((field) => field.id);
  await prisma.customFieldValue.deleteMany({
    where: { tenantId: companyId },
  });
  await prisma.customField.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineIds },
    },
  });
}

async function resetJobs(companyId) {
  const baselineJobIds = Object.values(FIXTURE.jobs).map((job) => job.id);
  await prisma.job.deleteMany({
    where: {
      companyId,
      id: { notIn: baselineJobIds },
    },
  });
}

async function resetBookings(companyId) {
  const baselineBookingIds = Object.values(FIXTURE.bookings).map((booking) => booking.id);
  await prisma.booking.deleteMany({
    where: {
      companyId,
      id: { notIn: baselineBookingIds },
    },
  });
}

async function resetBookingServices(companyId) {
  await prisma.service.deleteMany({
    where: { companyId },
  });
}

async function resetLocations(companyId) {
  const baselineLocationIds = Object.values(FIXTURE.locations).map((location) => location.id);
  await prisma.location.deleteMany({
    where: {
      companyId,
      id: { notIn: baselineLocationIds },
    },
  });
}

async function resetInventory(companyId) {
  const baselineStockItemIds = Object.values(FIXTURE.inventory.parts).map((item) => item.id);
  const baselineInventoryLocationIds = Object.values(FIXTURE.inventory.locations).map((location) => location.id);
  const baselineInventoryStockIds = Object.values(FIXTURE.inventory.stocks).map((stock) => stock.id);
  const baselineJobPartIds = Object.values(FIXTURE.inventory.jobParts).map((jobPart) => jobPart.id);
  const baselinePurchaseOrderIds = Object.values(FIXTURE.inventory.purchaseOrders).map((po) => po.id);
  const baselinePurchaseOrderLineIds = Object.values(FIXTURE.inventory.purchaseOrderLines).map((line) => line.id);
  const baselineMovementIds = [
    FIXTURE.inventory.movements.reservePortal.id,
    FIXTURE.inventory.movements.useInvoice.id,
  ];

  await prisma.stockPOLine.deleteMany({
    where: {
      po: { tenantId: companyId },
      id: { notIn: baselinePurchaseOrderLineIds },
    },
  });
  await prisma.stockPurchaseOrder.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselinePurchaseOrderIds },
    },
  });
  await prisma.stockMovement.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineMovementIds },
    },
  });
  await prisma.jobPart.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineJobPartIds },
    },
  });
  await prisma.inventoryStock.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineInventoryStockIds },
    },
  });
  await prisma.inventoryLocation.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineInventoryLocationIds },
    },
  });
  await prisma.stockItem.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineStockItemIds },
    },
  });
}

async function main() {
  if (process.env.MYTITAN_ENABLE_E2E_FIXTURES !== "1") {
    console.log("E2E fixture seed skipped. Set MYTITAN_ENABLE_E2E_FIXTURES=1 to run.");
    return;
  }

  console.log("Seeding deterministic MyTitan E2E fixtures...");

  const company = await ensureCompany();
  const locations = await ensureLocations(company.id);
  const location = locations.hq;
  const operator = await ensureOperator(company.id, location.id);
  const platformAdminUser = await ensurePlatformAdminUser(company.id, location.id);
  await ensureWorkspaceUser(company.id, location.id, FIXTURE.platformStaff.verified);
  await ensureWorkspaceUser(company.id, location.id, FIXTURE.platformStaff.unverified);
  await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.admin);
  const dispatcherUser = await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.dispatcher);
  const financeUser = await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.finance);
  const technicianUser = await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.technician);
  await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.externalOperator);
  const viewerUser = await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.viewer);
  await ensureWorkspaceUser(company.id, location.id, FIXTURE.workspaceUsers.passwordReset);
  await ensureEnterpriseFeatureFlag("e2e-flag-truck-stock-v1", {
    key: "truck_stock_v1",
    tenantId: company.id,
    environment: "all",
    enabled: true,
    rolloutPercentage: 100,
    overrideSource: "tenant",
    reason: "E2E enterprise inventory and truck stock baseline",
    metadataJson: { seed: true },
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureEnterpriseFeatureFlag("e2e-flag-customer-eta-v1", {
    key: "customer_eta_v1",
    tenantId: company.id,
    environment: "all",
    enabled: true,
    rolloutPercentage: 100,
    overrideSource: "tenant",
    reason: "E2E customer ETA and portal journey baseline",
    metadataJson: { seed: true },
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureEnterpriseFeatureFlag("e2e-flag-route-preview-v1", {
    key: "route_preview_v1",
    tenantId: company.id,
    environment: "all",
    enabled: true,
    rolloutPercentage: 100,
    overrideSource: "tenant",
    reason: "E2E route preview informational baseline",
    metadataJson: { seed: true },
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureEnterpriseFeatureFlag("e2e-flag-public-booking-bundles-v1", {
    key: "public_booking_bundles_v1",
    tenantId: company.id,
    environment: "all",
    enabled: false,
    rolloutPercentage: 0,
    overrideSource: "tenant",
    reason: "E2E public booking bundle tests start from the disabled baseline",
    metadataJson: { seed: true },
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureLocationMembership(company.id, locations.north.id, operator.id);
  await ensureLocationMembership(company.id, locations.north.id, dispatcherUser.id);
  await prisma.locationStaffAssignment.upsert({
    where: { locationId_userId: { locationId: locations.north.id, userId: operator.id } },
    create: { companyId: company.id, locationId: locations.north.id, userId: operator.id },
    update: { companyId: company.id },
  });
  await prisma.locationStaffAssignment.upsert({
    where: { locationId_userId: { locationId: locations.north.id, userId: dispatcherUser.id } },
    create: { companyId: company.id, locationId: locations.north.id, userId: dispatcherUser.id },
    update: { companyId: company.id },
  });
  const planId = await ensurePlan();

  await ensureInvoiceCounter(company.id);
  await ensureTenantSettings(company.id, location.id, planId);
  await ensureTenantSubscription(company.id, planId);
  await ensureInternalSupportWorkspace(planId);
  await ensureBookingBusinessHours(company.id);
  await ensureAutomations(company.id);
  await resetCustomFields(company.id);
  await resetJobs(company.id);
  await resetBookings(company.id);
  await resetBookingServices(company.id);
  await resetLocations(company.id);
  await resetInventory(company.id);
  const service = await ensureService(company.id);
  const customers = await ensureCustomers(company.id, { hq: locations.hq.id, north: locations.north.id });

  const now = new Date();
  const bookingBase = setUtcTime(now, 9, 0);
  const today = startOfDay(now);

  const invoiceReadyJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.invoiceReady.id,
    jobId: FIXTURE.jobs.invoiceReady.id,
    jobRef: FIXTURE.jobs.invoiceReady.jobRef,
    status: "COMPLETED",
    customerName: customers.invoiceReady.name,
    customerEmail: customers.invoiceReady.email,
    customerPhone: customers.invoiceReady.phone,
    totalCents: 62000,
    scheduledAt: addMinutes(today, 9 * 60),
    completedAt: addMinutes(now, -180),
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: addMinutes(now, -220),
    approvedByName: "E2E Customer",
    signedAt: addMinutes(now, -210),
    signatureName: "E2E Customer",
    signatureDataUrl: "data:image/png;base64,ZmFrZS1zaWduYXR1cmU=",
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Diamond Cut",
    vehicleMake: "BMW",
    vehicleModel: "M4",
    vehicleReg: "E2E001",
    formData: { selectedWheels: ["Front left", "Front right"], services: ["Diamond Cut"] },
    whatsappCompletionLink: null,
    assignedUserId: technicianUser.id,
    customerJourneyStage: "COMPLETED",
    customerFacingStatus: "Your service record is ready and the invoice is available.",
    customerFacingStatusUpdatedAt: addMinutes(now, -80),
    customerEtaWindowStart: addMinutes(today, 10 * 60),
    customerEtaWindowEnd: addMinutes(today, 12 * 60),
    customerEtaDurationMinutes: 120,
    customerEtaConfidence: "confirmed",
    customerEtaStatus: "ARRIVED",
    customerEtaNote: "Technician arrived within the scheduled visit window.",
    customerEtaUpdatedAt: addMinutes(now, -125),
    customerEtaUpdatedByUserId: technicianUser.id,
    customerTechnicianNameVisible: true,
  });

  const issuedJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.issued.id,
    jobId: FIXTURE.jobs.issued.id,
    jobRef: FIXTURE.jobs.issued.jobRef,
    status: "INVOICED",
    customerName: customers.issued.name,
    customerEmail: customers.issued.email,
    customerPhone: customers.issued.phone,
    totalCents: 68000,
    scheduledAt: addMinutes(today, 8 * 60),
    completedAt: addMinutes(now, -420),
    invoiceIssuedAt: addMinutes(now, -240),
    invoiceDueAt: addMinutes(now, -60),
    invoicePaidAt: null,
    approvedAt: addMinutes(now, -430),
    approvedByName: "E2E Issued Awaiting Payment",
    signedAt: addMinutes(now, -425),
    signatureName: "E2E Issued Awaiting Payment",
    signatureDataUrl: "data:image/png;base64,ZmFrZS1zaWduYXR1cmU=",
    paymentLinkUrl: "https://pay.mytitan.local/e2e-issued-001",
    paymentReceiptUrl: null,
    invoicePdfUrl: "https://cdn.mytitan.local/e2e-issued-001.pdf",
    paymentCheckoutSessionId: "e2e-session-issued-001",
    serviceName: "Painted",
    vehicleMake: "Audi",
    vehicleModel: "A5",
    vehicleReg: "E2E002",
    formData: { selectedWheels: ["Rear left", "Rear right"], services: ["Painted"], paymentMethod: "CARD", paymentStatus: "open" },
    whatsappCompletionLink: null,
    assignedUserId: null,
  });

  const portalActiveJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.portalActive.id,
    jobId: FIXTURE.jobs.portalActive.id,
    jobRef: FIXTURE.jobs.portalActive.jobRef,
    status: "COMPLETED",
    customerName: customers.portalActive.name,
    customerEmail: customers.portalActive.email,
    customerPhone: customers.portalActive.phone,
    totalCents: 71000,
    scheduledAt: addMinutes(today, 10 * 60),
    completedAt: addMinutes(now, -120),
    invoiceIssuedAt: addMinutes(now, -90),
    invoiceDueAt: addMinutes(now, 2 * 24 * 60),
    invoicePaidAt: null,
    approvedAt: addMinutes(now, -110),
    approvedByName: "Portal Active Customer",
    signedAt: addMinutes(now, -105),
    signatureName: "Portal Active Customer",
    signatureDataUrl: "data:image/png;base64,ZmFrZS1zaWduYXR1cmU=",
    paymentLinkUrl: "https://pay.mytitan.local/e2e-portal-active-001",
    paymentReceiptUrl: null,
    invoicePdfUrl: "https://cdn.mytitan.local/e2e-portal-active-001.pdf",
    paymentCheckoutSessionId: "e2e-session-portal-active-001",
    serviceName: "Diamond Cut",
    vehicleMake: "Porsche",
    vehicleModel: "911",
    vehicleReg: "E2E003",
    formData: { selectedWheels: ["Front left", "Rear left"], services: ["Diamond Cut"], paymentMethod: "CARD", paymentStatus: "open" },
    whatsappCompletionLink: `http://127.0.0.1:3001/portal/job/${FIXTURE.tokens.active}`,
    assignedUserId: null,
  });

  const portalExpiredJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.portalExpired.id,
    jobId: FIXTURE.jobs.portalExpired.id,
    jobRef: FIXTURE.jobs.portalExpired.jobRef,
    status: "COMPLETED",
    customerName: customers.portalExpired.name,
    customerEmail: customers.portalExpired.email,
    customerPhone: customers.portalExpired.phone,
    totalCents: 45000,
    scheduledAt: addMinutes(today, 11 * 60),
    completedAt: addMinutes(now, -150),
    invoiceIssuedAt: addMinutes(now, -100),
    invoiceDueAt: addMinutes(now, -30),
    invoicePaidAt: addMinutes(now, -20),
    approvedAt: addMinutes(now, -160),
    approvedByName: "Portal Expired Customer",
    signedAt: addMinutes(now, -155),
    signatureName: "Portal Expired Customer",
    signatureDataUrl: "data:image/png;base64,ZmFrZS1zaWduYXR1cmU=",
    paymentLinkUrl: null,
    paymentReceiptUrl: "https://cdn.mytitan.local/e2e-portal-expired-receipt.pdf",
    invoicePdfUrl: "https://cdn.mytitan.local/e2e-portal-expired-001.pdf",
    paymentCheckoutSessionId: null,
    serviceName: "Painted",
    vehicleMake: "Mercedes",
    vehicleModel: "C63",
    vehicleReg: "E2E004",
    formData: { selectedWheels: ["Rear left"], services: ["Painted"], paymentMethod: "CARD", paymentStatus: "paid" },
    whatsappCompletionLink: null,
    assignedUserId: null,
  });

  const technicianJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.technician.id,
    jobId: FIXTURE.jobs.technician.id,
    jobRef: FIXTURE.jobs.technician.jobRef,
    status: "SCHEDULED",
    customerName: customers.technician.name,
    customerEmail: customers.technician.email,
    customerPhone: customers.technician.phone,
    totalCents: 38000,
    scheduledAt: addMinutes(now, 45),
    completedAt: null,
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: null,
    approvedByName: null,
    signedAt: null,
    signatureName: null,
    signatureDataUrl: null,
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Mobile repair",
    vehicleMake: "Volkswagen",
    vehicleModel: "Golf R",
    vehicleReg: "E2E005",
    formData: { selectedWheels: ["Front right"], services: ["Mobile repair"] },
    whatsappCompletionLink: null,
    assignedUserId: operator.id,
  });

  const automationJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.automation.id,
    jobId: FIXTURE.jobs.automation.id,
    jobRef: FIXTURE.jobs.automation.jobRef,
    status: "IN_PROGRESS",
    customerName: customers.automation.name,
    customerEmail: customers.automation.email,
    customerPhone: customers.automation.phone,
    totalCents: 41000,
    scheduledAt: addMinutes(now, 75),
    completedAt: null,
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: null,
    approvedByName: null,
    signedAt: null,
    signatureName: null,
    signatureDataUrl: null,
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Automation completion check",
    vehicleMake: "Tesla",
    vehicleModel: "Model 3",
    vehicleReg: "E2E006",
    formData: { selectedWheels: ["Rear right"], services: ["Automation completion check"] },
    whatsappCompletionLink: null,
    assignedUserId: operator.id,
  });

  const openJob = await ensureJob({
    companyId: company.id,
    locationId: locations.north.id,
    userId: operator.id,
    customerId: customers.open.id,
    jobId: FIXTURE.jobs.open.id,
    jobRef: FIXTURE.jobs.open.jobRef,
    status: "OPEN",
    customerName: customers.open.name,
    customerEmail: customers.open.email,
    customerPhone: customers.open.phone,
    totalCents: 29000,
    scheduledAt: addMinutes(now, 180),
    completedAt: null,
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: null,
    approvedByName: null,
    signedAt: null,
    signatureName: null,
    signatureDataUrl: null,
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Inspection",
    vehicleMake: "Tesla",
    vehicleModel: "Model 3",
    vehicleReg: "E2E006",
    formData: { selectedWheels: ["Front left"], services: ["Inspection"] },
    whatsappCompletionLink: null,
    assignedUserId: null,
  });

  const financeReadyJob = await ensureJob({
    companyId: company.id,
    locationId: locations.north.id,
    userId: operator.id,
    customerId: customers.financeOps.id,
    jobId: FIXTURE.jobs.financeReady.id,
    jobRef: FIXTURE.jobs.financeReady.jobRef,
    status: "COMPLETED",
    customerName: customers.financeOps.name,
    customerEmail: customers.financeOps.email,
    customerPhone: customers.financeOps.phone,
    totalCents: 54000,
    scheduledAt: addMinutes(today, 13 * 60),
    completedAt: addMinutes(now, -90),
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: addMinutes(now, -95),
    approvedByName: "E2E Finance Customer",
    signedAt: addMinutes(now, -92),
    signatureName: "E2E Finance Customer",
    signatureDataUrl: "data:image/png;base64,ZmFrZS1zaWduYXR1cmU=",
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Finance governance check",
    vehicleMake: "Jaguar",
    vehicleModel: "F-Type",
    vehicleReg: "E2E007",
    formData: { selectedWheels: ["Front left"], services: ["Finance governance check"] },
    whatsappCompletionLink: null,
    assignedUserId: null,
  });

  const technicianRoleJob = await ensureJob({
    companyId: company.id,
    locationId: location.id,
    userId: operator.id,
    customerId: customers.technicianRole.id,
    jobId: FIXTURE.jobs.technicianRole.id,
    jobRef: FIXTURE.jobs.technicianRole.jobRef,
    status: "SCHEDULED",
    customerName: customers.technicianRole.name,
    customerEmail: customers.technicianRole.email,
    customerPhone: customers.technicianRole.phone,
    totalCents: 33000,
    scheduledAt: addMinutes(now, 120),
    completedAt: null,
    invoiceIssuedAt: null,
    invoiceDueAt: null,
    invoicePaidAt: null,
    approvedAt: null,
    approvedByName: null,
    signedAt: null,
    signatureName: null,
    signatureDataUrl: null,
    paymentLinkUrl: null,
    paymentReceiptUrl: null,
    invoicePdfUrl: null,
    paymentCheckoutSessionId: null,
    serviceName: "Technician governance check",
    vehicleMake: "Ford",
    vehicleModel: "Focus ST",
    vehicleReg: "E2E008",
    formData: { selectedWheels: ["Rear left"], services: ["Technician governance check"] },
    whatsappCompletionLink: null,
    assignedUserId: technicianUser.id,
  });

  await ensureJobActivity(company.id, invoiceReadyJob.id, operator.id, "e2e-activity-invoice-ready-complete", "job.status", "Job completed and ready for invoice", addMinutes(now, -170));
  await ensureJobActivity(company.id, issuedJob.id, operator.id, "e2e-activity-issued-invoice", "billing.invoice.issued", "Invoice issued to customer", addMinutes(now, -235));
  await ensureJobActivity(company.id, issuedJob.id, operator.id, "e2e-activity-issued-follow-up", "job.reminder.create", "Billing follow-up queued", addMinutes(now, -200));
  await ensureJobActivity(company.id, portalActiveJob.id, operator.id, "e2e-activity-portal-active", "portal.link.ensure", "Portal link prepared for customer", addMinutes(now, -95));
  await ensureJobActivity(company.id, portalExpiredJob.id, operator.id, "e2e-activity-portal-expired", "billing.payment.received", "Payment received and receipt stored", addMinutes(now, -25));
  await ensureJobActivity(company.id, technicianJob.id, operator.id, "e2e-activity-tech-arrived", "tech.arrived", "Technician arrived on site", addMinutes(now, -15));
  await ensureJobActivity(company.id, technicianJob.id, operator.id, "e2e-activity-tech-note", "tech.note", "Customer requested extra care on the front-right wheel.", addMinutes(now, -10));
  await ensureJobActivity(company.id, automationJob.id, operator.id, "e2e-activity-auto-work", "tech.note", "Automation test job is active and ready for completion.", addMinutes(now, -8));
  await ensureJobActivity(company.id, openJob.id, operator.id, "e2e-activity-open", "job.status", "New job created in the command centre queue", addMinutes(now, -60));
  await ensureJobActivity(company.id, financeReadyJob.id, operator.id, "e2e-activity-finance-ready", "job.status", "Finance governance job is ready for invoice issuance", addMinutes(now, -85));
  await ensureJobActivity(company.id, technicianRoleJob.id, technicianUser.id, "e2e-activity-tech-role-assigned", "job.status", "Technician governance job assigned to role-scoped technician", addMinutes(now, -20));

  await ensureReminder("e2e-reminder-billing-overdue", company.id, issuedJob.id, addMinutes(now, -180), "Automation billing follow-up");
  await ensureReminder("e2e-reminder-dispatch-overdue", company.id, openJob.id, addMinutes(now, -90), "Automation dispatch follow-up");

  await ensureStockItem(FIXTURE.inventory.parts.alloyKit.id, {
    tenantId: company.id,
    locationId: location.id,
    sku: FIXTURE.inventory.parts.alloyKit.sku,
    name: FIXTURE.inventory.parts.alloyKit.name,
    description: "Seeded alloy repair kit for deterministic inventory coverage.",
    category: "Repair materials",
    unit: "kit",
    minLevel: 4,
    avgUnitCost: 28,
    unitPriceCents: 5200,
    supplierId: null,
    isActive: true,
    metadataJson: { seed: true },
  });
  await ensureStockItem(FIXTURE.inventory.parts.lacquer.id, {
    tenantId: company.id,
    locationId: location.id,
    sku: FIXTURE.inventory.parts.lacquer.sku,
    name: FIXTURE.inventory.parts.lacquer.name,
    description: "Seeded lacquer stock row with low-stock pressure.",
    category: "Consumables",
    unit: "can",
    minLevel: 6,
    avgUnitCost: 12,
    unitPriceCents: 2600,
    supplierId: null,
    isActive: true,
    metadataJson: { seed: true },
  });
  await ensureStockItem(FIXTURE.inventory.parts.bolts.id, {
    tenantId: company.id,
    locationId: location.id,
    sku: FIXTURE.inventory.parts.bolts.sku,
    name: FIXTURE.inventory.parts.bolts.name,
    description: "Seeded van stock row for technician use.",
    category: "Hardware",
    unit: "set",
    minLevel: 2,
    avgUnitCost: 18,
    unitPriceCents: 3400,
    supplierId: null,
    isActive: true,
    metadataJson: { seed: true },
  });

  await ensureInventoryLocation(FIXTURE.inventory.locations.warehouse.id, {
    tenantId: company.id,
    name: FIXTURE.inventory.locations.warehouse.name,
    kind: "WAREHOUSE",
    active: true,
    businessLocationId: locations.hq.id,
  });
  await ensureInventoryLocation(FIXTURE.inventory.locations.van.id, {
    tenantId: company.id,
    name: FIXTURE.inventory.locations.van.name,
    kind: "VAN",
    active: true,
    businessLocationId: locations.north.id,
  });
  await ensureTechnicianStockAssignment("e2e-technician-van-assignment", {
    tenantId: company.id,
    technicianId: technicianUser.id,
    inventoryLocationId: FIXTURE.inventory.locations.van.id,
    active: true,
    assignedAt: addMinutes(now, -180),
    releasedAt: null,
    notesJson: { seed: true, label: "Primary technician van" },
  });

  await ensureInventoryStock(FIXTURE.inventory.stocks.alloyWarehouse.id, {
    tenantId: company.id,
    stockItemId: FIXTURE.inventory.parts.alloyKit.id,
    inventoryLocationId: FIXTURE.inventory.locations.warehouse.id,
    quantityOnHand: 12,
    quantityReserved: 3,
    reorderPoint: 4,
  });
  await ensureInventoryStock(FIXTURE.inventory.stocks.lacquerWarehouse.id, {
    tenantId: company.id,
    stockItemId: FIXTURE.inventory.parts.lacquer.id,
    inventoryLocationId: FIXTURE.inventory.locations.warehouse.id,
    quantityOnHand: 2,
    quantityReserved: 2,
    reorderPoint: 6,
  });
  await ensureInventoryStock(FIXTURE.inventory.stocks.boltsVan.id, {
    tenantId: company.id,
    stockItemId: FIXTURE.inventory.parts.bolts.id,
    inventoryLocationId: FIXTURE.inventory.locations.van.id,
    quantityOnHand: 5,
    quantityReserved: 0,
    reorderPoint: 2,
  });

  await ensureJobPart(FIXTURE.inventory.jobParts.portalReserved.id, {
    tenantId: company.id,
    jobId: portalActiveJob.id,
    stockItemId: FIXTURE.inventory.parts.alloyKit.id,
    quantityPlanned: 3,
    quantityReserved: 3,
    quantityUsed: 0,
    unitCostCents: 2800,
    unitPriceCents: 5200,
    sourceLocationId: FIXTURE.inventory.locations.warehouse.id,
    status: "RESERVED",
  });
  await ensureJobPart(FIXTURE.inventory.jobParts.technicianDraft.id, {
    tenantId: company.id,
    jobId: technicianJob.id,
    stockItemId: FIXTURE.inventory.parts.bolts.id,
    quantityPlanned: 1,
    quantityReserved: 0,
    quantityUsed: 0,
    unitCostCents: 1800,
    unitPriceCents: 3400,
    sourceLocationId: FIXTURE.inventory.locations.van.id,
    status: "PLANNED",
  });
  await ensureJobPart(FIXTURE.inventory.jobParts.invoiceUsed.id, {
    tenantId: company.id,
    jobId: invoiceReadyJob.id,
    stockItemId: FIXTURE.inventory.parts.lacquer.id,
    quantityPlanned: 1,
    quantityReserved: 0,
    quantityUsed: 1,
    unitCostCents: 1200,
    unitPriceCents: 2600,
    sourceLocationId: FIXTURE.inventory.locations.warehouse.id,
    status: "USED",
  });

  await ensureStockPurchaseOrder(FIXTURE.inventory.purchaseOrders.open.id, {
    tenantId: company.id,
    locationId: locations.hq.id,
    inventoryLocationId: FIXTURE.inventory.locations.warehouse.id,
    supplierId: null,
    supplierName: "Seeded Supplies Ltd",
    status: "ORDERED",
    orderedAt: addMinutes(now, -180),
    receivedAt: null,
    notesJson: { seed: true, focus: "lacquer shortage" },
  }, [
    {
      id: FIXTURE.inventory.purchaseOrderLines.openLacquer.id,
      stockItemId: FIXTURE.inventory.parts.lacquer.id,
      qtyOrdered: 8,
      qtyReceived: 0,
      unitCost: 11,
    },
  ]);

  await ensureStockMovement(FIXTURE.inventory.movements.reservePortal.id, {
    tenantId: company.id,
    locationId: locations.hq.id,
    inventoryLocationId: FIXTURE.inventory.locations.warehouse.id,
    stockItemId: FIXTURE.inventory.parts.alloyKit.id,
    type: "RESERVE",
    qty: 3,
    reason: "Seeded reservation for portal-active job",
    jobId: portalActiveJob.id,
  });
  await ensureStockMovement(FIXTURE.inventory.movements.useInvoice.id, {
    tenantId: company.id,
    locationId: locations.hq.id,
    inventoryLocationId: FIXTURE.inventory.locations.warehouse.id,
    stockItemId: FIXTURE.inventory.parts.lacquer.id,
    type: "USE",
    qty: 1,
    reason: "Seeded used quantity on invoice-ready job",
    jobId: invoiceReadyJob.id,
  });

  await prisma.jobPdf.upsert({
    where: { jobId: portalActiveJob.id },
    create: {
      jobId: portalActiveJob.id,
      url: "https://cdn.mytitan.local/e2e-portal-active-001.pdf",
      contentBase64: "JVBERi0xLjQKJUVPRi0K",
    },
    update: {
      url: "https://cdn.mytitan.local/e2e-portal-active-001.pdf",
      contentBase64: "JVBERi0xLjQKJUVPRi0K",
    },
  });

  await prisma.publicJobToken.updateMany({
    where: {
      jobId: portalActiveJob.id,
      token: { not: FIXTURE.tokens.active },
    },
    data: { expiresAt: addMinutes(now, -5) },
  });
  await prisma.publicJobToken.updateMany({
    where: {
      jobId: portalExpiredJob.id,
      token: { not: FIXTURE.tokens.expired },
    },
    data: { expiresAt: addMinutes(now, -5) },
  });
  await ensurePublicToken(FIXTURE.tokens.active, portalActiveJob.id, addMinutes(now, 30 * 24 * 60));
  await ensurePublicToken(FIXTURE.tokens.expired, portalExpiredJob.id, addMinutes(now, -60));

  await prisma.job.update({
    where: { id: portalActiveJob.id },
    data: {
      whatsappCompletionLink: `http://127.0.0.1:3001/portal/job/${FIXTURE.tokens.active}`,
    },
  });
  await prisma.job.update({
    where: { id: portalExpiredJob.id },
    data: {
      whatsappCompletionLink: null,
    },
  });

  await prisma.booking.upsert({
    where: { id: FIXTURE.bookings.convertible.id },
    create: {
      id: FIXTURE.bookings.convertible.id,
      companyId: company.id,
      locationId: location.id,
      serviceId: service.id,
      customerName: customers.convertible.name,
      customerEmail: customers.convertible.email,
      customerPhone: customers.convertible.phone,
      startsAt: addMinutes(bookingBase, 120),
      endsAt: addMinutes(bookingBase, 180),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
    update: {
      locationId: location.id,
      jobId: null,
      serviceId: service.id,
      customerName: customers.convertible.name,
      customerEmail: customers.convertible.email,
      customerPhone: customers.convertible.phone,
      startsAt: addMinutes(bookingBase, 120),
      endsAt: addMinutes(bookingBase, 180),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
  });

  await prisma.booking.upsert({
    where: { id: FIXTURE.bookings.blocked.id },
    create: {
      id: FIXTURE.bookings.blocked.id,
      companyId: company.id,
      locationId: locations.north.id,
      serviceId: service.id,
      customerName: null,
      customerEmail: customers.blocked.email,
      customerPhone: customers.blocked.phone,
      startsAt: addMinutes(bookingBase, 240),
      endsAt: addMinutes(bookingBase, 300),
      status: "PLANNED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
    update: {
      locationId: locations.north.id,
      jobId: null,
      serviceId: service.id,
      customerName: null,
      customerEmail: customers.blocked.email,
      customerPhone: customers.blocked.phone,
      startsAt: addMinutes(bookingBase, 240),
      endsAt: addMinutes(bookingBase, 300),
      status: "PLANNED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
  });

  await prisma.booking.upsert({
    where: { id: FIXTURE.bookings.technician.id },
    create: {
      id: FIXTURE.bookings.technician.id,
      companyId: company.id,
      locationId: location.id,
      jobId: technicianJob.id,
      serviceId: service.id,
      customerName: customers.technician.name,
      customerEmail: customers.technician.email,
      customerPhone: customers.technician.phone,
      startsAt: addMinutes(bookingBase, 30),
      endsAt: addMinutes(bookingBase, 90),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
    update: {
      locationId: location.id,
      jobId: technicianJob.id,
      serviceId: service.id,
      customerName: customers.technician.name,
      customerEmail: customers.technician.email,
      customerPhone: customers.technician.phone,
      startsAt: addMinutes(bookingBase, 30),
      endsAt: addMinutes(bookingBase, 90),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: operator.id,
    },
  });

  await prisma.booking.upsert({
    where: { id: FIXTURE.bookings.technicianRole.id },
    create: {
      id: FIXTURE.bookings.technicianRole.id,
      companyId: company.id,
      locationId: locations.north.id,
      jobId: technicianRoleJob.id,
      serviceId: service.id,
      customerName: customers.technicianRole.name,
      customerEmail: customers.technicianRole.email,
      customerPhone: customers.technicianRole.phone,
      startsAt: addMinutes(bookingBase, 360),
      endsAt: addMinutes(bookingBase, 420),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: technicianUser.id,
    },
    update: {
      locationId: locations.north.id,
      jobId: technicianRoleJob.id,
      serviceId: service.id,
      customerName: customers.technicianRole.name,
      customerEmail: customers.technicianRole.email,
      customerPhone: customers.technicianRole.phone,
      startsAt: addMinutes(bookingBase, 360),
      endsAt: addMinutes(bookingBase, 420),
      status: "CONFIRMED",
      source: "INTERNAL",
      assignedUserId: technicianUser.id,
    },
  });

  const serialField = await ensureCustomField(company.id, FIXTURE.customFields.jobSerialNumber);
  const warrantyField = await ensureCustomField(company.id, FIXTURE.customFields.jobWarrantyStatus);
  const bookingSourceField = await ensureCustomField(company.id, FIXTURE.customFields.bookingSource);
  const siteCodeField = await ensureCustomField(company.id, FIXTURE.customFields.customerSiteCode);
  const certificationField = await ensureCustomField(company.id, FIXTURE.customFields.technicianCertification);

  await ensureCustomFieldValue(company.id, serialField.id, "JOB", invoiceReadyJob.id, "INV-READY-SN-001");
  await ensureCustomFieldValue(company.id, serialField.id, "JOB", automationJob.id, "AUTO-SN-001");
  await ensureCustomFieldValue(company.id, warrantyField.id, "JOB", automationJob.id, "expired");
  await ensureCustomFieldValue(company.id, warrantyField.id, "JOB", portalActiveJob.id, "active");
  await ensureCustomFieldValue(company.id, bookingSourceField.id, "BOOKING", FIXTURE.bookings.convertible.id, "website");
  await ensureCustomFieldValue(company.id, siteCodeField.id, "CUSTOMER", customers.convertible.id, "SITE-E2E-01");
  await ensureCustomFieldValue(company.id, certificationField.id, "TECHNICIAN", operator.id, "EV Specialist");
  await ensureCustomFieldValue(company.id, certificationField.id, "TECHNICIAN", technicianUser.id, "E2E Mobile Certified");
  await ensureApiToken(company.id, operator.id);
  await ensurePersonalGoogleConnection(company.id, operator.id);
  await ensureByogCredential({
    id: FIXTURE.integrations.tenantCredentials.stripe.id,
    tenantId: company.id,
    provider: "STRIPE_CUSTOMER_PAYMENTS",
    credentialType: "MERCHANT_PAYMENT_GATEWAY_CONFIG",
    scope: "WORKSPACE",
    scopeOwnerKey: "workspace",
    userId: null,
    displayName: "E2E Business Stripe",
    status: "DISABLED",
    encryptedPayload: encryptSeedText(JSON.stringify({ accountLabel: "Disabled seed", mode: "test" })),
    encryptedSecretMaterial: encryptSeedText("whsec_e2e_disabled_stripe_customer"),
    metadataJson: { accountLabel: "Disabled seed", environment: "test", paymentsOwner: "tenant" },
    routeId: FIXTURE.integrations.tenantCredentials.stripe.routeId,
    lastVerifiedAt: null,
    lastWebhookReceivedAt: null,
    lastErrorCategory: "disabled",
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureByogCredential({
    id: FIXTURE.integrations.tenantCredentials.quickbooks.id,
    tenantId: company.id,
    provider: "QUICKBOOKS",
    credentialType: "ACCOUNTING_CONFIG",
    scope: "WORKSPACE",
    scopeOwnerKey: "workspace",
    userId: null,
    displayName: "E2E Books",
    status: "CONNECTED",
    encryptedPayload: encryptSeedText(JSON.stringify({ realmId: "e2e-realm", accountLabel: "E2E Finance" })),
    encryptedSecretMaterial: encryptSeedText("qbo_e2e_webhook_secret"),
    metadataJson: {
      accountLabel: "E2E Finance",
      environment: "sandbox",
      permissions: ["accounting.access", "customers.read", "webhooks.verify"],
    },
    routeId: FIXTURE.integrations.tenantCredentials.quickbooks.routeId,
    lastVerifiedAt: addMinutes(new Date(), -35),
    lastWebhookReceivedAt: addMinutes(new Date(), -15),
    lastErrorCategory: null,
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureByogCredential({
    id: FIXTURE.integrations.tenantCredentials.personalGoogle.id,
    tenantId: company.id,
    provider: "GOOGLE_CALENDAR",
    credentialType: "CALENDAR_CONFIG",
    scope: "USER",
    scopeOwnerKey: operator.id,
    userId: operator.id,
    displayName: "E2E Personal Calendar",
    status: "CONNECTED",
    encryptedPayload: encryptSeedText(JSON.stringify({ calendarId: "primary", accountLabel: "Operator calendar" })),
    encryptedSecretMaterial: encryptSeedText("google_e2e_personal_refresh"),
    metadataJson: {
      accountLabel: "Operator calendar",
      syncMode: "bookings",
      permissions: ["calendar.events"],
    },
    routeId: FIXTURE.integrations.tenantCredentials.personalGoogle.routeId,
    lastVerifiedAt: addMinutes(new Date(), -30),
    lastWebhookReceivedAt: null,
    lastErrorCategory: null,
    createdByUserId: operator.id,
    updatedByUserId: operator.id,
  });
  await ensureByogCredential({
    id: FIXTURE.integrations.tenantCredentials.supportGenericWebhook.id,
    tenantId: FIXTURE.supportAccount.company.id,
    provider: "GENERIC_WEBHOOK",
    credentialType: "WEBHOOK_SECRET",
    scope: "WORKSPACE",
    scopeOwnerKey: "workspace",
    userId: null,
    displayName: "Support tenant webhook",
    status: "CONNECTED",
    encryptedPayload: encryptSeedText(JSON.stringify({ routeLabel: "support" })),
    encryptedSecretMaterial: encryptSeedText("support_webhook_secret"),
    metadataJson: { routeLabel: "support", permissions: ["webhooks.verify"] },
    routeId: FIXTURE.integrations.tenantCredentials.supportGenericWebhook.routeId,
    lastVerifiedAt: addMinutes(new Date(), -20),
    lastWebhookReceivedAt: null,
    lastErrorCategory: null,
    createdByUserId: FIXTURE.supportAccount.user.id,
    updatedByUserId: FIXTURE.supportAccount.user.id,
  });
  const seededWebhook = await ensureWebhookEndpoint(company.id, operator.id);

  await ensureSavedViews(company.id, operator.id);

  await ensureActivityEvent("e2e-activity-email-sent", {
    type: "email.sent",
    label: "Billing follow-up email sent for E2E-ISSUED-001",
    at: addMinutes(now, -70),
    tenantId: company.id,
    customerId: customers.issued.id,
    customerName: customers.issued.name,
    jobId: issuedJob.id,
    jobRef: issuedJob.jobRef,
    status: issuedJob.status,
  });
  await ensureActivityEvent("e2e-activity-booking-converted", {
    type: "booking.converted",
    label: "Booking converted for E2E portal coverage",
    at: addMinutes(now, -55),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
  });
  await ensureActivityEvent("e2e-activity-tech-arrived", {
    type: "technician.arrived",
    label: "Technician arrived for E2E-TECH-001",
    at: addMinutes(now, -12),
    tenantId: company.id,
    customerId: customers.technician.id,
    customerName: customers.technician.name,
    jobId: technicianJob.id,
    jobRef: technicianJob.jobRef,
    status: technicianJob.status,
    technicianId: operator.id,
  });
  await ensureActivityEvent("e2e-automation-run-overdue-invoice", {
    type: "automation.rule_run",
    label: "Rule Add an overdue invoice follow-up automation success",
    at: addMinutes(now, -25),
    tenantId: company.id,
    customerId: customers.issued.id,
    customerName: customers.issued.name,
    jobId: issuedJob.id,
    jobRef: issuedJob.jobRef,
    status: "success",
    payloadJson: {
      automationRuleId: "seeded-overdue-suggestion-example",
      automationRuleName: "Add an overdue invoice follow-up automation",
      trigger: "invoice.overdue",
      actionType: "create_reminder",
      result: {
        outcome: "success",
        reminderId: "e2e-reminder-billing-overdue",
      },
    },
  });
  await ensureActivityEvent("e2e-automation-run-tech-arrival", {
    type: "automation.rule_run",
    label: "Rule Technician arrival office notification skipped",
    at: addMinutes(now, -11),
    tenantId: company.id,
    customerId: customers.technician.id,
    customerName: customers.technician.name,
    jobId: technicianJob.id,
    jobRef: technicianJob.jobRef,
    status: "skipped",
    payloadJson: {
      automationRuleId: "seeded-tech-arrival-example",
      automationRuleName: "Technician arrival office notification",
      trigger: "technician.arrived",
      actionType: "send_internal_notification",
      result: {
        outcome: "skipped",
        reason: "existing_open_reminder",
      },
    },
  });
  await ensureActivityEvent("e2e-activity-job-created", {
    type: "job.created",
    label: "Job created for E2E integration visibility",
    at: addMinutes(now, -28),
    tenantId: company.id,
    customerId: customers.open.id,
    customerName: customers.open.name,
    jobId: openJob.id,
    jobRef: openJob.jobRef,
    status: openJob.status,
  });
  await ensureWebhookDelivery(FIXTURE.integrations.deliveries.success, {
    tenantId: company.id,
    endpointId: seededWebhook.id,
    eventType: "job.created",
    eventId: "e2e-activity-job-created",
    requestUrl: seededWebhook.url,
    status: "SUCCESS",
    payloadJson: {
      id: "e2e-activity-job-created",
      type: "job.created",
      label: "Job created for E2E integration visibility",
    },
    signature: "sha256=e2e",
    responseStatus: 202,
    responseBody: "accepted",
    durationMs: 84,
    attemptedAt: addMinutes(now, -27),
    deliveredAt: addMinutes(now, -27),
  });
  await ensureWebhookDelivery(FIXTURE.integrations.deliveries.failed, {
    tenantId: company.id,
    endpointId: seededWebhook.id,
    eventType: "automation.rule_ran",
    eventId: "e2e-automation-run-tech-arrival",
    requestUrl: seededWebhook.url,
    status: "FAILED",
    payloadJson: {
      id: "e2e-automation-run-tech-arrival",
      type: "automation.rule_ran",
      label: "Rule Technician arrival office notification skipped",
    },
    signature: "sha256=e2e",
    responseStatus: 500,
    responseBody: "server error",
    errorMessage: "HTTP 500",
    durationMs: 132,
    attemptedAt: addMinutes(now, -10),
    deliveredAt: null,
  });

  await prisma.documentArtifact.deleteMany({ where: { tenantId: company.id } });
  await fs.rm(path.join(artifactRoot(), company.id), { recursive: true, force: true });

  const seededInvoiceStoragePath = await writeSeedArtifact(
    company.id,
    "JOB",
    invoiceReadyJob.id,
    FIXTURE.artifacts.jobInvoice.fileName,
    "Seeded invoice pack for E2E billing artifact coverage.",
  );
  const seededPortalStoragePath = await writeSeedArtifact(
    company.id,
    "JOB",
    portalActiveJob.id,
    FIXTURE.artifacts.jobPortal.fileName,
    "Customer-safe completion summary for E2E portal artifact coverage.",
  );
  const seededCustomerStoragePath = await writeSeedArtifact(
    company.id,
    "CUSTOMER",
    customers.convertible.id,
    FIXTURE.artifacts.customerAttachment.fileName,
    "Customer warranty note for deterministic artifact coverage.",
  );

  await ensureDocumentArtifact(FIXTURE.artifacts.jobInvoice.id, {
    tenantId: company.id,
    entityType: "JOB",
    entityId: invoiceReadyJob.id,
    kind: "INVOICE",
    label: FIXTURE.artifacts.jobInvoice.label,
    fileName: FIXTURE.artifacts.jobInvoice.fileName,
    storagePath: seededInvoiceStoragePath,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength("Seeded invoice pack for E2E billing artifact coverage."),
    portalVisible: false,
    createdByUserId: operator.id,
    createdAt: addMinutes(now, -31),
  });
  await ensureDocumentArtifact(FIXTURE.artifacts.jobPortal.id, {
    tenantId: company.id,
    entityType: "JOB",
    entityId: portalActiveJob.id,
    kind: "PORTAL_DOCUMENT",
    label: FIXTURE.artifacts.jobPortal.label,
    fileName: FIXTURE.artifacts.jobPortal.fileName,
    storagePath: seededPortalStoragePath,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength("Customer-safe completion summary for E2E portal artifact coverage."),
    portalVisible: true,
    createdByUserId: operator.id,
    createdAt: addMinutes(now, -18),
  });
  await ensureDocumentArtifact(FIXTURE.artifacts.customerAttachment.id, {
    tenantId: company.id,
    entityType: "CUSTOMER",
    entityId: customers.convertible.id,
    kind: "CUSTOMER_ATTACHMENT",
    label: FIXTURE.artifacts.customerAttachment.label,
    fileName: FIXTURE.artifacts.customerAttachment.fileName,
    storagePath: seededCustomerStoragePath,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength("Customer warranty note for deterministic artifact coverage."),
    portalVisible: false,
    createdByUserId: operator.id,
    createdAt: addMinutes(now, -16),
  });

  await prisma.jobExecutionEvidence.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.executionEvidence.portalDocument.id,
          FIXTURE.executionEvidence.portalAcknowledgement.id,
          FIXTURE.executionEvidence.technicianNote.id,
        ],
      },
    },
  });
  await prisma.jobExecutionRecord.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.executionRecords.technicianDraft.id,
          FIXTURE.executionRecords.portalSubmitted.id,
          FIXTURE.executionRecords.technicianRoleSubmitted.id,
          FIXTURE.executionRecords.invoiceAcknowledged.id,
        ],
      },
    },
  });

  await ensureJobExecutionRecord(FIXTURE.executionRecords.technicianDraft.id, {
    tenantId: company.id,
    jobId: technicianJob.id,
    technicianId: technicianUser.id,
    status: "IN_PROGRESS",
    startedAt: addMinutes(now, -25),
    completedAt: null,
    submittedAt: null,
    acknowledgedAt: null,
    summary: "Technician is still finishing the on-site wheel repair evidence pack.",
    checklistJson: [
      { key: "arrival", label: "Confirm site access", completed: true },
      { key: "repair", label: "Complete repair work", completed: true },
      { key: "proof", label: "Capture customer-safe proof", completed: false },
    ],
    notesJson: {
      completionNotes: "Need one final customer-safe proof reference before submission.",
    },
  });
  await ensureJobExecutionRecord(FIXTURE.executionRecords.portalSubmitted.id, {
    tenantId: company.id,
    jobId: portalActiveJob.id,
    technicianId: technicianUser.id,
    status: "SUBMITTED",
    startedAt: addMinutes(now, -90),
    completedAt: addMinutes(now, -24),
    submittedAt: addMinutes(now, -22),
    acknowledgedAt: null,
    summary: "Completed compliance review and shared the customer-safe completion summary.",
    checklistJson: [
      { key: "arrival", label: "Confirm site access", completed: true },
      { key: "work", label: "Complete planned service", completed: true },
      { key: "proof", label: "Share completion proof", completed: true },
    ],
    notesJson: {
      completionNotes: "Customer-safe completion summary published to the portal.",
    },
  });
  await ensureJobExecutionRecord(FIXTURE.executionRecords.technicianRoleSubmitted.id, {
    tenantId: company.id,
    jobId: technicianRoleJob.id,
    technicianId: technicianUser.id,
    status: "SUBMITTED",
    startedAt: addMinutes(now, -70),
    completedAt: addMinutes(now, -68),
    submittedAt: addMinutes(now, -66),
    acknowledgedAt: null,
    summary: "Role-scoped technician completion was submitted and is awaiting acknowledgement.",
    checklistJson: [
      { key: "handoff", label: "Confirm work handoff", completed: true },
      { key: "proof", label: "Submit technician proof", completed: true },
    ],
    notesJson: {
      completionNotes: "Submitted from the technician role coverage path.",
    },
  });
  await ensureJobExecutionRecord(FIXTURE.executionRecords.invoiceAcknowledged.id, {
    tenantId: company.id,
    jobId: invoiceReadyJob.id,
    technicianId: operator.id,
    status: "ACKNOWLEDGED",
    startedAt: addMinutes(now, -180),
    completedAt: addMinutes(now, -178),
    submittedAt: addMinutes(now, -176),
    acknowledgedAt: addMinutes(now, -170),
    summary: "Invoice-ready work completed and acknowledged by the customer.",
    checklistJson: [
      { key: "scope", label: "Confirm work scope", completed: true },
      { key: "finish", label: "Complete job", completed: true },
      { key: "handoff", label: "Customer acknowledgement", completed: true },
    ],
    notesJson: {
      completionNotes: "Customer confirmed the finished work before billing was issued.",
      customerAcknowledgementNote: "Looks good on site.",
    },
  });

  await ensureJobExecutionEvidence(FIXTURE.executionEvidence.technicianNote.id, {
    tenantId: company.id,
    jobId: technicianJob.id,
    executionRecordId: FIXTURE.executionRecords.technicianDraft.id,
    kind: "NOTE",
    label: "Awaiting final proof label",
    artifactId: null,
    payloadJson: { source: "seed" },
    createdBy: technicianUser.id,
  });
  await ensureJobExecutionEvidence(FIXTURE.executionEvidence.portalDocument.id, {
    tenantId: company.id,
    jobId: portalActiveJob.id,
    executionRecordId: FIXTURE.executionRecords.portalSubmitted.id,
    kind: "CHECKLIST_ATTACHMENT",
    label: FIXTURE.artifacts.jobPortal.label,
    artifactId: FIXTURE.artifacts.jobPortal.id,
    payloadJson: { portalVisible: true },
    createdBy: technicianUser.id,
  });
  await ensureJobExecutionEvidence(FIXTURE.executionEvidence.portalAcknowledgement.id, {
    tenantId: company.id,
    jobId: invoiceReadyJob.id,
    executionRecordId: FIXTURE.executionRecords.invoiceAcknowledged.id,
    kind: "CUSTOMER_ACKNOWLEDGEMENT",
    label: "Customer acknowledged completion",
    artifactId: null,
    payloadJson: { note: "Looks good on site." },
    createdBy: null,
  });

  await prisma.customerApproval.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.customerApprovals.pendingJob.id,
          FIXTURE.customerApprovals.approvedDocument.id,
          FIXTURE.customerApprovals.pendingQuote.id,
        ],
      },
    },
  });
  await prisma.customerAccount.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: [FIXTURE.customerWorkspace.activeAccount.id, FIXTURE.customerWorkspace.invitedAccount.id] },
    },
  });

  await ensureCustomerAccount(FIXTURE.customerWorkspace.activeAccount.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    email: FIXTURE.customerWorkspace.activeAccount.email,
    passwordHash: await bcrypt.hash(FIXTURE.customerWorkspace.activeAccount.password, 10),
    status: "ACTIVE",
    invitedAt: addMinutes(now, -120),
    activatedAt: addMinutes(now, -118),
    lastLoginAt: addMinutes(now, -30),
    inviteTokenHash: null,
    inviteTokenExpiresAt: null,
  });
  await ensureCustomerAccount(FIXTURE.customerWorkspace.invitedAccount.id, {
    tenantId: company.id,
    customerId: customers.blocked.id,
    email: FIXTURE.customerWorkspace.invitedAccount.email,
    passwordHash: "",
    status: "INVITED",
    invitedAt: addMinutes(now, -45),
    activatedAt: null,
    lastLoginAt: null,
    inviteTokenHash: tokenHash(FIXTURE.customerWorkspace.invitedAccount.inviteToken),
    inviteTokenExpiresAt: addMinutes(now, 60 * 24 * 7),
  });

  await ensureCustomerApproval(FIXTURE.customerApprovals.pendingJob.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    entityType: "JOB",
    entityId: portalActiveJob.id,
    kind: "WORK_AUTHORIZATION",
    status: "PENDING",
    requestedAt: addMinutes(now, -20),
    respondedAt: null,
    responseNote: null,
    requestedByUserId: operator.id,
  });
  await ensureCustomerApproval(FIXTURE.customerApprovals.approvedDocument.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    entityType: "DOCUMENT",
    entityId: FIXTURE.artifacts.jobPortal.id,
    kind: "DOCUMENT_ACKNOWLEDGEMENT",
    status: "APPROVED",
    requestedAt: addMinutes(now, -19),
    respondedAt: addMinutes(now, -18),
    responseNote: "Reviewed in seeded workspace flow",
    requestedByUserId: operator.id,
  });

  const seededQuoteIds = [FIXTURE.quotes.draft.id, FIXTURE.quotes.sent.id, FIXTURE.quotes.approved.id];
  await prisma.quoteLineItem.deleteMany({
    where: {
      quoteId: { notIn: seededQuoteIds },
      quote: { tenantId: company.id },
    },
  });
  await prisma.quote.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: seededQuoteIds },
    },
  });
  await prisma.revenueCollectionTask.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: [FIXTURE.revenueTasks.overdueInvoice.id] },
    },
  });

  await ensureQuote(
    FIXTURE.quotes.draft.id,
    {
      tenantId: company.id,
      customerId: customers.financeOps.id,
      jobId: financeReadyJob.id,
      bookingId: null,
      quoteNumber: FIXTURE.quotes.draft.number,
      status: "DRAFT",
      title: FIXTURE.quotes.draft.title,
      summary: "Seeded draft quote for revenue operator editing coverage.",
      subtotalCents: 25000,
      taxCents: 5000,
      totalCents: 30000,
      currency: "GBP",
      expiresAt: addMinutes(now, 60 * 24 * 5),
      approvedAt: null,
      declinedAt: null,
      convertedAt: null,
      createdByUserId: operator.id,
      createdAt: addMinutes(now, -80),
      updatedAt: addMinutes(now, -75),
    },
    [
      {
        type: "LABOUR",
        title: "Refinish labour",
        quantity: 1,
        unitPriceCents: 18000,
        totalPriceCents: 18000,
      },
      {
        type: "PART",
        title: "Protective finish",
        quantity: 1,
        unitPriceCents: 7000,
        totalPriceCents: 7000,
      },
    ],
  );

  await ensureQuote(
    FIXTURE.quotes.sent.id,
    {
      tenantId: company.id,
      customerId: customers.portalActive.id,
      jobId: portalActiveJob.id,
      bookingId: null,
      quoteNumber: FIXTURE.quotes.sent.number,
      status: "SENT",
      title: FIXTURE.quotes.sent.title,
      summary: "Seeded sent quote awaiting customer response in the customer workspace.",
      subtotalCents: 42000,
      taxCents: 8400,
      totalCents: 50400,
      currency: "GBP",
      expiresAt: addMinutes(now, 60 * 24 * 3),
      approvedAt: null,
      declinedAt: null,
      convertedAt: null,
      createdByUserId: operator.id,
      createdAt: addMinutes(now, -65),
      updatedAt: addMinutes(now, -60),
    },
    [
      {
        type: "LABOUR",
        title: "Field repair labour",
        quantity: 2,
        unitPriceCents: 12000,
        totalPriceCents: 24000,
      },
      {
        type: "FEE",
        title: "Callout fee",
        quantity: 1,
        unitPriceCents: 18000,
        totalPriceCents: 18000,
      },
    ],
  );

  await ensureQuote(
    FIXTURE.quotes.approved.id,
    {
      tenantId: company.id,
      customerId: customers.convertible.id,
      jobId: null,
      bookingId: FIXTURE.bookings.convertible.id,
      quoteNumber: FIXTURE.quotes.approved.number,
      status: "APPROVED",
      title: FIXTURE.quotes.approved.title,
      summary: "Seeded approved quote ready for explicit operator conversion.",
      subtotalCents: 36000,
      taxCents: 7200,
      totalCents: 43200,
      currency: "GBP",
      expiresAt: addMinutes(now, 60 * 24 * 7),
      approvedAt: addMinutes(now, -35),
      declinedAt: null,
      convertedAt: null,
      createdByUserId: operator.id,
      createdAt: addMinutes(now, -70),
      updatedAt: addMinutes(now, -35),
    },
    [
      {
        type: "LABOUR",
        title: "Recurring service labour",
        quantity: 1,
        unitPriceCents: 28000,
        totalPriceCents: 28000,
      },
      {
        type: "PART",
        title: "Seal kit",
        quantity: 1,
        unitPriceCents: 8000,
        totalPriceCents: 8000,
      },
    ],
  );

  await ensureRevenueCollectionTask(FIXTURE.revenueTasks.overdueInvoice.id, {
    tenantId: company.id,
    jobId: issuedJob.id,
    quoteId: null,
    customerId: customers.issued.id,
    kind: "INVOICE_FOLLOW_UP",
    status: "OPEN",
    dueAt: addMinutes(now, -60),
    completedAt: null,
    notesJson: {
      title: `Invoice overdue for ${issuedJob.jobRef}`,
      state: "invoice_overdue",
      jobRef: issuedJob.jobRef,
      totalCents: issuedJob.totalCents,
      sourceFingerprint: `job:${issuedJob.id}:overdue:${new Date(issuedJob.invoiceDueAt).toISOString()}`,
    },
    createdAt: addMinutes(now, -58),
    updatedAt: addMinutes(now, -58),
  });

  await ensureCustomerApproval(FIXTURE.customerApprovals.pendingQuote.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    entityType: "QUOTE",
    entityId: FIXTURE.quotes.sent.id,
    kind: "QUOTE_ACCEPTANCE",
    status: "PENDING",
    requestedAt: addMinutes(now, -59),
    respondedAt: null,
    responseNote: null,
    requestedByUserId: operator.id,
  });

  await ensureActivityEvent("e2e-activity-artifact-created", {
    type: "artifact.created",
    label: `Added ${FIXTURE.artifacts.jobPortal.label}`,
    at: addMinutes(now, -17),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
    payloadJson: {
      entityType: "JOB",
      entityId: portalActiveJob.id,
      kind: "PORTAL_DOCUMENT",
      label: FIXTURE.artifacts.jobPortal.label,
    },
  });
  await ensureActivityEvent("e2e-activity-customer-account-invited", {
    type: "customer.account.invited",
    label: "Invited customer account for E2E Blocked Customer",
    at: addMinutes(now, -45),
    tenantId: company.id,
    customerId: customers.blocked.id,
    customerName: customers.blocked.name,
    payloadJson: {
      customerAccountId: FIXTURE.customerWorkspace.invitedAccount.id,
      email: FIXTURE.customerWorkspace.invitedAccount.email,
      invitedByUserId: operator.id,
    },
  });
  await ensureActivityEvent("e2e-activity-customer-account-activated", {
    type: "customer.account.activated",
    label: "Customer account activated for E2E Portal Active",
    at: addMinutes(now, -118),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    payloadJson: {
      customerAccountId: FIXTURE.customerWorkspace.activeAccount.id,
      email: FIXTURE.customerWorkspace.activeAccount.email,
    },
  });
  await ensureActivityEvent("e2e-activity-customer-approval-requested", {
    type: "customer.approval.requested",
    label: `Requested work authorization for ${portalActiveJob.jobRef}`,
    at: addMinutes(now, -20),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
    payloadJson: {
      approvalId: FIXTURE.customerApprovals.pendingJob.id,
      entityType: "JOB",
      entityId: portalActiveJob.id,
      kind: "WORK_AUTHORIZATION",
      requestedByUserId: operator.id,
    },
  });
  await ensureActivityEvent("e2e-activity-customer-approval-approved", {
    type: "customer.approval.approved",
    label: `Approved document acknowledgement for ${FIXTURE.artifacts.jobPortal.label}`,
    at: addMinutes(now, -18),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
    payloadJson: {
      approvalId: FIXTURE.customerApprovals.approvedDocument.id,
      entityType: "DOCUMENT",
      entityId: FIXTURE.artifacts.jobPortal.id,
      kind: "DOCUMENT_ACKNOWLEDGEMENT",
    },
  });
  await ensureActivityEvent("e2e-activity-quote-sent", {
    type: "quote.sent",
    label: `Quote sent: ${FIXTURE.quotes.sent.number}`,
    at: addMinutes(now, -59),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: "SENT",
    payloadJson: {
      quoteId: FIXTURE.quotes.sent.id,
      quoteNumber: FIXTURE.quotes.sent.number,
      totalCents: 50400,
    },
  });
  await ensureActivityEvent("e2e-activity-quote-approved", {
    type: "quote.approved",
    label: `Quote approved: ${FIXTURE.quotes.approved.number}`,
    at: addMinutes(now, -35),
    tenantId: company.id,
    customerId: customers.convertible.id,
    customerName: customers.convertible.name,
    jobId: null,
    jobRef: null,
    status: "APPROVED",
    payloadJson: {
      quoteId: FIXTURE.quotes.approved.id,
      quoteNumber: FIXTURE.quotes.approved.number,
    },
  });
  await ensureActivityEvent("e2e-activity-revenue-task-opened", {
    type: "revenue.task.opened",
    label: `Invoice overdue for ${issuedJob.jobRef}`,
    at: addMinutes(now, -58),
    tenantId: company.id,
    customerId: customers.issued.id,
    customerName: customers.issued.name,
    jobId: issuedJob.id,
    jobRef: issuedJob.jobRef,
    status: "OPEN",
    payloadJson: {
      revenueTaskId: FIXTURE.revenueTasks.overdueInvoice.id,
      kind: "INVOICE_FOLLOW_UP",
      sourceFingerprint: `job:${issuedJob.id}:overdue:${new Date(issuedJob.invoiceDueAt).toISOString()}`,
    },
  });
  await ensureActivityEvent("e2e-activity-execution-submitted", {
    type: "job.execution.submitted",
    label: `Submitted completion record for ${portalActiveJob.jobRef}`,
    at: addMinutes(now, -22),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
    payloadJson: {
      executionRecordId: FIXTURE.executionRecords.portalSubmitted.id,
    },
  });
  await ensureActivityEvent("e2e-activity-execution-acknowledged", {
    type: "job.execution.acknowledged",
    label: `Customer acknowledged completion for ${invoiceReadyJob.jobRef}`,
    at: addMinutes(now, -170),
    tenantId: company.id,
    customerId: customers.invoiceReady.id,
    customerName: customers.invoiceReady.name,
    jobId: invoiceReadyJob.id,
    jobRef: invoiceReadyJob.jobRef,
    status: invoiceReadyJob.status,
    payloadJson: {
      executionRecordId: FIXTURE.executionRecords.invoiceAcknowledged.id,
    },
  });

  const seededServicePlanIds = [FIXTURE.servicePlans.active.id, FIXTURE.servicePlans.paused.id, FIXTURE.servicePlans.portalRenewal.id];
  await prisma.servicePlanChangeRequest.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: [FIXTURE.servicePlanChangeRequests.customerOpen.id, FIXTURE.servicePlanChangeRequests.operatorCompleted.id] },
    },
  });
  await prisma.servicePlanRenewal.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: [FIXTURE.servicePlanRenewals.portalPending.id] },
    },
  });
  await prisma.servicePlanRun.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: [FIXTURE.servicePlans.run.id] },
    },
  });
  await prisma.servicePlanTask.deleteMany({
    where: {
      planId: { notIn: seededServicePlanIds },
      plan: { tenantId: company.id },
    },
  });
  await prisma.servicePlan.deleteMany({
    where: {
      tenantId: company.id,
      id: { notIn: seededServicePlanIds },
    },
  });

  await ensureServicePlan(FIXTURE.servicePlans.active.id, {
    tenantId: company.id,
    customerId: customers.convertible.id,
    locationId: locations.hq.id,
    name: FIXTURE.servicePlans.active.name,
    description: "Recurring quarterly check for high-value fleet customers.",
    status: "ACTIVE",
    cadenceUnit: "QUARTER",
    cadenceInterval: 1,
    nextRunAt: addMinutes(now, -90),
    lastRunAt: addMinutes(now, -60 * 24 * 30),
    autoCreateBooking: true,
    autoCreateJob: false,
    notesJson: { operatorNotes: "Seeded recurring booking plan" },
    portalVisible: true,
    createdByUserId: operator.id,
  }, [
    { title: "Inspect tyres" },
    { title: "Check service records" },
  ]);

  await ensureServicePlan(FIXTURE.servicePlans.paused.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    locationId: locations.north.id,
    name: FIXTURE.servicePlans.paused.name,
    description: "Annual review kept paused for operator-controlled resume coverage.",
    status: "PAUSED",
    cadenceUnit: "YEAR",
    cadenceInterval: 1,
    nextRunAt: addMinutes(now, 60 * 24 * 14),
    lastRunAt: addMinutes(now, -60 * 24 * 180),
    autoCreateBooking: false,
    autoCreateJob: true,
    notesJson: { operatorNotes: "Seeded paused recurring job plan" },
    portalVisible: true,
    createdByUserId: operator.id,
  }, [
    { title: "Review warranty status" },
  ]);

  await ensureServicePlan(FIXTURE.servicePlans.portalRenewal.id, {
    tenantId: company.id,
    customerId: customers.portalActive.id,
    locationId: locations.hq.id,
    name: FIXTURE.servicePlans.portalRenewal.name,
    description: "Customer-visible plan seeded for renewal decisions.",
    status: "ACTIVE",
    cadenceUnit: "MONTH",
    cadenceInterval: 6,
    nextRunAt: addMinutes(now, 60 * 24 * 10),
    lastRunAt: addMinutes(now, -60 * 24 * 120),
    autoCreateBooking: true,
    autoCreateJob: false,
    notesJson: { operatorNotes: "Seeded self-serve renewal plan" },
    portalVisible: true,
    createdByUserId: operator.id,
  }, [
    { title: "Review compliance items" },
    { title: "Confirm site access requirements" },
  ]);

  await ensureServicePlanRun(FIXTURE.servicePlans.run.id, {
    tenantId: company.id,
    planId: FIXTURE.servicePlans.active.id,
    scheduledFor: addMinutes(now, -60 * 24 * 30),
    executedAt: addMinutes(now, -60 * 24 * 30 + 5),
    status: "EXECUTED",
    bookingId: FIXTURE.bookings.convertible.id,
    jobId: null,
    resultJson: {
      trigger: "due",
      bookingId: FIXTURE.bookings.convertible.id,
    },
  });

  await ensureActivityEvent("e2e-activity-service-plan-executed", {
    type: "service_plan.executed",
    label: `Executed recurring plan ${FIXTURE.servicePlans.active.name}`,
    at: addMinutes(now, -60 * 24 * 30 + 5),
    tenantId: company.id,
    customerId: customers.convertible.id,
    customerName: customers.convertible.name,
    payloadJson: {
      planId: FIXTURE.servicePlans.active.id,
      bookingId: FIXTURE.bookings.convertible.id,
    },
  });

  await ensureServicePlanRenewal(FIXTURE.servicePlanRenewals.portalPending.id, {
    tenantId: company.id,
    planId: FIXTURE.servicePlans.portalRenewal.id,
    customerId: customers.portalActive.id,
    status: "PENDING",
    renewalWindowStartAt: addMinutes(now, -60 * 24 * 2),
    renewalWindowEndAt: addMinutes(now, 60 * 24 * 14),
    requestedAt: addMinutes(now, -60 * 24),
    respondedAt: null,
    completedAt: null,
    notesJson: { seeded: true, source: "e2e" },
  });

  await ensureServicePlanChangeRequest(FIXTURE.servicePlanChangeRequests.customerOpen.id, {
    tenantId: company.id,
    planId: FIXTURE.servicePlans.paused.id,
    customerId: customers.portalActive.id,
    status: "OPEN",
    kind: "RESUME_REQUEST",
    requestedBy: "CUSTOMER",
    requestedAt: addMinutes(now, -60 * 6),
    respondedAt: null,
    responseNote: null,
    payloadJson: { note: "Please restart this plan next week." },
  });

  await ensureServicePlanChangeRequest(FIXTURE.servicePlanChangeRequests.operatorCompleted.id, {
    tenantId: company.id,
    planId: FIXTURE.servicePlans.active.id,
    customerId: customers.convertible.id,
    status: "COMPLETED",
    kind: "SCOPE_CHANGE_REQUEST",
    requestedBy: "OPERATOR",
    requestedAt: addMinutes(now, -60 * 24 * 5),
    respondedAt: addMinutes(now, -60 * 24 * 4),
    responseNote: "Scope note logged and customer informed.",
    payloadJson: { note: "Add seasonal tyre depth photo capture." },
  });

  await ensureActivityEvent("e2e-activity-service-plan-renewal-requested", {
    type: "service_plan.renewal.requested",
    label: `Requested renewal for ${FIXTURE.servicePlans.portalRenewal.name}`,
    at: addMinutes(now, -60 * 24),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    payloadJson: {
      planId: FIXTURE.servicePlans.portalRenewal.id,
      renewalId: FIXTURE.servicePlanRenewals.portalPending.id,
    },
  });

  await ensureActivityEvent("e2e-activity-service-plan-change-request-created", {
    type: "service_plan.change_request.created",
    label: `Customer requested resume request for ${FIXTURE.servicePlans.paused.name}`,
    at: addMinutes(now, -60 * 6),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    payloadJson: {
      planId: FIXTURE.servicePlans.paused.id,
      requestId: FIXTURE.servicePlanChangeRequests.customerOpen.id,
      kind: "RESUME_REQUEST",
      requestedBy: "CUSTOMER",
    },
  });

  await ensureActivityEvent("e2e-activity-service-plan-change-request-completed", {
    type: "service_plan.change_request.completed",
    label: `Completed scope change request for ${FIXTURE.servicePlans.active.name}`,
    at: addMinutes(now, -60 * 24 * 4),
    tenantId: company.id,
    customerId: customers.convertible.id,
    customerName: customers.convertible.name,
    payloadJson: {
      planId: FIXTURE.servicePlans.active.id,
      requestId: FIXTURE.servicePlanChangeRequests.operatorCompleted.id,
      kind: "SCOPE_CHANGE_REQUEST",
    },
  });

  await prisma.technicianAvailability.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.scheduling.availabilityOperator.id,
          FIXTURE.scheduling.availabilityTechnician.id,
        ],
      },
    },
  });
  await prisma.technicianCapacityException.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.scheduling.exceptionReduced.id,
          FIXTURE.scheduling.exceptionUnavailable.id,
        ],
      },
    },
  });

  const weekdaySchedule = {
    mon: [{ start: "08:00", end: "16:00" }],
    tue: [{ start: "08:00", end: "16:00" }],
    wed: [{ start: "08:00", end: "16:00" }],
    thu: [{ start: "08:00", end: "16:00" }],
    fri: [{ start: "08:00", end: "16:00" }],
  };
  await ensureTechScheduleSetting(company.id, operator.id, weekdaySchedule);
  await ensureTechScheduleSetting(company.id, technicianUser.id, {
    mon: [{ start: "09:00", end: "14:00" }],
    tue: [{ start: "09:00", end: "14:00" }],
    wed: [{ start: "09:00", end: "14:00" }],
    thu: [{ start: "09:00", end: "14:00" }],
    fri: [{ start: "09:00", end: "14:00" }],
  });

  await ensureTechnicianAvailability(FIXTURE.scheduling.availabilityOperator.id, {
    tenantId: company.id,
    technicianId: operator.id,
    date: today,
    startTime: "08:00",
    endTime: "15:00",
    capacityMinutes: 420,
    notesJson: { operatorNotes: "Healthy seeded dispatch capacity" },
  });
  await ensureTechnicianAvailability(FIXTURE.scheduling.availabilityTechnician.id, {
    tenantId: company.id,
    technicianId: technicianUser.id,
    date: today,
    startTime: "09:00",
    endTime: "10:30",
    capacityMinutes: 90,
    notesJson: { operatorNotes: "Reduced field capacity for overload coverage" },
  });
  await ensureTechnicianCapacityException(FIXTURE.scheduling.exceptionReduced.id, {
    tenantId: company.id,
    technicianId: technicianUser.id,
    date: today,
    type: "REDUCED_CAPACITY",
    startTime: "09:30",
    endTime: "10:30",
    capacityMinutes: 60,
    reason: "Parts collection blocks most of the morning",
  });
  await ensureTechnicianCapacityException(FIXTURE.scheduling.exceptionUnavailable.id, {
    tenantId: company.id,
    technicianId: operator.id,
    date: addMinutes(today, 24 * 60),
    type: "UNAVAILABLE",
    startTime: "08:00",
    endTime: "16:00",
    capacityMinutes: 420,
    reason: "Training day blocks the full shift",
  });

  await prisma.workflowSlaEvent.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.compliance.events.openServicePlan.id,
          FIXTURE.compliance.events.breachedQuote.id,
        ],
      },
    },
  });
  await prisma.workflowSlaPolicy.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.compliance.policies.quoteApproval.id,
          FIXTURE.compliance.policies.servicePlanExecution.id,
        ],
      },
    },
  });
  await prisma.complianceException.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [
          FIXTURE.compliance.exceptions.openManualOverride.id,
          FIXTURE.compliance.exceptions.openEvidenceReview.id,
          FIXTURE.compliance.exceptions.resolvedInvoiceReview.id,
        ],
      },
    },
  });

  await prisma.workflowSlaPolicy.upsert({
    where: { id: FIXTURE.compliance.policies.quoteApproval.id },
    create: {
      id: FIXTURE.compliance.policies.quoteApproval.id,
      tenantId: company.id,
      name: FIXTURE.compliance.policies.quoteApproval.name,
      entityType: "QUOTE",
      triggerStatus: "SENT",
      targetStatus: "APPROVED",
      targetMinutes: 60,
      severity: "WARNING",
      active: true,
      metadataJson: { seed: true, focus: "quote approval lag" },
    },
    update: {
      tenantId: company.id,
      name: FIXTURE.compliance.policies.quoteApproval.name,
      entityType: "QUOTE",
      triggerStatus: "SENT",
      targetStatus: "APPROVED",
      targetMinutes: 60,
      severity: "WARNING",
      active: true,
      metadataJson: { seed: true, focus: "quote approval lag" },
    },
  });
  await prisma.workflowSlaPolicy.upsert({
    where: { id: FIXTURE.compliance.policies.servicePlanExecution.id },
    create: {
      id: FIXTURE.compliance.policies.servicePlanExecution.id,
      tenantId: company.id,
      name: FIXTURE.compliance.policies.servicePlanExecution.name,
      entityType: "SERVICE_PLAN",
      triggerStatus: "ACTIVE",
      targetStatus: "PAUSED",
      targetMinutes: 720,
      severity: "CRITICAL",
      active: true,
      metadataJson: { seed: true, focus: "service plan operator follow-through" },
    },
    update: {
      tenantId: company.id,
      name: FIXTURE.compliance.policies.servicePlanExecution.name,
      entityType: "SERVICE_PLAN",
      triggerStatus: "ACTIVE",
      targetStatus: "PAUSED",
      targetMinutes: 720,
      severity: "CRITICAL",
      active: true,
      metadataJson: { seed: true, focus: "service plan operator follow-through" },
    },
  });

  await prisma.workflowSlaEvent.upsert({
    where: { id: FIXTURE.compliance.events.openServicePlan.id },
    create: {
      id: FIXTURE.compliance.events.openServicePlan.id,
      tenantId: company.id,
      policyId: FIXTURE.compliance.policies.servicePlanExecution.id,
      entityType: "SERVICE_PLAN",
      entityId: FIXTURE.servicePlans.portalRenewal.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      startedAt: addMinutes(now, -45),
      dueAt: addMinutes(now, 180),
      completedAt: null,
      breachedAt: null,
      status: "OPEN",
      contextJson: {
        label: FIXTURE.servicePlans.portalRenewal.name,
        href: "/dashboard/service-plans",
        seed: true,
      },
    },
    update: {
      tenantId: company.id,
      policyId: FIXTURE.compliance.policies.servicePlanExecution.id,
      entityType: "SERVICE_PLAN",
      entityId: FIXTURE.servicePlans.portalRenewal.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      startedAt: addMinutes(now, -45),
      dueAt: addMinutes(now, 180),
      completedAt: null,
      breachedAt: null,
      status: "OPEN",
      contextJson: {
        label: FIXTURE.servicePlans.portalRenewal.name,
        href: "/dashboard/service-plans",
        seed: true,
      },
    },
  });
  await prisma.workflowSlaEvent.upsert({
    where: { id: FIXTURE.compliance.events.breachedQuote.id },
    create: {
      id: FIXTURE.compliance.events.breachedQuote.id,
      tenantId: company.id,
      policyId: FIXTURE.compliance.policies.quoteApproval.id,
      entityType: "QUOTE",
      entityId: FIXTURE.quotes.sent.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      startedAt: addMinutes(now, -240),
      dueAt: addMinutes(now, -120),
      completedAt: null,
      breachedAt: addMinutes(now, -60),
      status: "BREACHED",
      contextJson: {
        label: FIXTURE.quotes.sent.number,
        href: "/dashboard/quotes",
        seed: true,
      },
    },
    update: {
      tenantId: company.id,
      policyId: FIXTURE.compliance.policies.quoteApproval.id,
      entityType: "QUOTE",
      entityId: FIXTURE.quotes.sent.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      startedAt: addMinutes(now, -240),
      dueAt: addMinutes(now, -120),
      completedAt: null,
      breachedAt: addMinutes(now, -60),
      status: "BREACHED",
      contextJson: {
        label: FIXTURE.quotes.sent.number,
        href: "/dashboard/quotes",
        seed: true,
      },
    },
  });

  await prisma.complianceException.upsert({
    where: { id: FIXTURE.compliance.exceptions.openManualOverride.id },
    create: {
      id: FIXTURE.compliance.exceptions.openManualOverride.id,
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.financeReady.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      kind: "MANUAL_OVERRIDE",
      severity: "WARNING",
      status: "OPEN",
      summary: "Manual override on finance-ready workflow needs operator review",
      detailsJson: {
        reason: "Seeded compliance queue row for operator review coverage.",
        href: `/dashboard/jobs/${FIXTURE.jobs.financeReady.id}`,
      },
      createdBy: operator.id,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: addMinutes(now, -30),
    },
    update: {
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.financeReady.id,
      locationId: locations.hq.id,
      assignedUserId: operator.id,
      kind: "MANUAL_OVERRIDE",
      severity: "WARNING",
      status: "OPEN",
      summary: "Manual override on finance-ready workflow needs operator review",
      detailsJson: {
        reason: "Seeded compliance queue row for operator review coverage.",
        href: `/dashboard/jobs/${FIXTURE.jobs.financeReady.id}`,
      },
      createdBy: operator.id,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: addMinutes(now, -30),
    },
  });
  await prisma.complianceException.upsert({
    where: { id: FIXTURE.compliance.exceptions.resolvedInvoiceReview.id },
    create: {
      id: FIXTURE.compliance.exceptions.resolvedInvoiceReview.id,
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.issued.id,
      locationId: locations.north.id,
      assignedUserId: technicianUser.id,
      kind: "SLA_BREACH",
      severity: "CRITICAL",
      status: "RESOLVED",
      summary: "Issued invoice review has already been closed out",
      detailsJson: {
        reason: "Seeded resolved exception row for history coverage.",
      },
      createdBy: operator.id,
      resolvedBy: operator.id,
      resolvedAt: addMinutes(now, -15),
      createdAt: addMinutes(now, -120),
    },
    update: {
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.issued.id,
      locationId: locations.north.id,
      assignedUserId: technicianUser.id,
      kind: "SLA_BREACH",
      severity: "CRITICAL",
      status: "RESOLVED",
      summary: "Issued invoice review has already been closed out",
      detailsJson: {
        reason: "Seeded resolved exception row for history coverage.",
      },
      createdBy: operator.id,
      resolvedBy: operator.id,
      resolvedAt: addMinutes(now, -15),
      createdAt: addMinutes(now, -120),
    },
  });
  await prisma.complianceException.upsert({
    where: { id: FIXTURE.compliance.exceptions.openEvidenceReview.id },
    create: {
      id: FIXTURE.compliance.exceptions.openEvidenceReview.id,
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.portalActive.id,
      locationId: locations.hq.id,
      assignedUserId: technicianUser.id,
      kind: "MANUAL_OVERRIDE",
      severity: "CRITICAL",
      status: "OPEN",
      summary: "Portal-active completion evidence review is awaiting operator acknowledgement",
      detailsJson: {
        reason: "Seeded dismissable compliance queue row for operator workflow coverage.",
      },
      createdBy: operator.id,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: addMinutes(now, -28),
    },
    update: {
      tenantId: company.id,
      entityType: "JOB",
      entityId: FIXTURE.jobs.portalActive.id,
      locationId: locations.hq.id,
      assignedUserId: technicianUser.id,
      kind: "MANUAL_OVERRIDE",
      severity: "CRITICAL",
      status: "OPEN",
      summary: "Portal-active completion evidence review is awaiting operator acknowledgement",
      detailsJson: {
        reason: "Seeded dismissable compliance queue row for operator workflow coverage.",
      },
      createdBy: operator.id,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: addMinutes(now, -28),
    },
  });

  await ensureActivityEvent("e2e-activity-compliance-policy-created", {
    type: "compliance.policy_created",
    label: `Created SLA policy ${FIXTURE.compliance.policies.quoteApproval.name}`,
    at: addMinutes(now, -235),
    tenantId: company.id,
    payloadJson: {
      workflowSlaPolicyId: FIXTURE.compliance.policies.quoteApproval.id,
      entityType: "QUOTE",
    },
  });
  await ensureActivityEvent("e2e-activity-sla-breached", {
    type: "sla.breached",
    label: `${FIXTURE.compliance.policies.quoteApproval.name} breached`,
    at: addMinutes(now, -60),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: "SENT",
    payloadJson: {
      workflowSlaEventId: FIXTURE.compliance.events.breachedQuote.id,
      policyId: FIXTURE.compliance.policies.quoteApproval.id,
      entityType: "QUOTE",
      entityId: FIXTURE.quotes.sent.id,
    },
  });
  await ensureActivityEvent("e2e-activity-compliance-exception-created", {
    type: "compliance.exception_created",
    label: "Manual override on finance-ready workflow needs operator review",
    at: addMinutes(now, -30),
    tenantId: company.id,
    customerId: customers.financeOps.id,
    customerName: customers.financeOps.name,
    jobId: financeReadyJob.id,
    jobRef: financeReadyJob.jobRef,
    status: financeReadyJob.status,
    payloadJson: {
      complianceExceptionId: FIXTURE.compliance.exceptions.openManualOverride.id,
      kind: "MANUAL_OVERRIDE",
      entityType: "JOB",
      entityId: financeReadyJob.id,
    },
  });
  await ensureActivityEvent("e2e-activity-compliance-exception-created-evidence", {
    type: "compliance.exception_created",
    label: "Portal-active completion evidence review is awaiting operator acknowledgement",
    at: addMinutes(now, -28),
    tenantId: company.id,
    customerId: customers.portalActive.id,
    customerName: customers.portalActive.name,
    jobId: portalActiveJob.id,
    jobRef: portalActiveJob.jobRef,
    status: portalActiveJob.status,
    payloadJson: {
      complianceExceptionId: FIXTURE.compliance.exceptions.openEvidenceReview.id,
      kind: "MANUAL_OVERRIDE",
      entityType: "JOB",
      entityId: portalActiveJob.id,
    },
  });
  await ensureActivityEvent("e2e-activity-compliance-exception-resolved", {
    type: "compliance.exception_resolved",
    label: "Issued invoice review has already been closed out",
    at: addMinutes(now, -15),
    tenantId: company.id,
    customerId: customers.issued.id,
    customerName: customers.issued.name,
    jobId: issuedJob.id,
    jobRef: issuedJob.jobRef,
    status: issuedJob.status,
    payloadJson: {
      complianceExceptionId: FIXTURE.compliance.exceptions.resolvedInvoiceReview.id,
      entityType: "JOB",
      entityId: issuedJob.id,
    },
  });

  await ensureActivityEvent("e2e-activity-schedule-overload", {
    type: "schedule.pressure",
    label: "Technician capacity reduced for overload planning coverage",
    at: addMinutes(now, -9),
    tenantId: company.id,
    technicianId: technicianUser.id,
    payloadJson: {
      technicianId: technicianUser.id,
      availableMinutes: 30,
      scheduledMinutes: 60,
      remainingMinutes: -30,
    },
  });

  await prisma.compensationRun.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [FIXTURE.compensation.runs.technicianDraft.id],
      },
    },
  });
  await prisma.compensationRule.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [FIXTURE.compensation.rules.technician.id],
      },
    },
  });
  await prisma.performancePeriod.deleteMany({
    where: {
      tenantId: company.id,
      id: {
        notIn: [FIXTURE.performance.periods.current.id],
      },
    },
  });

  const periodStartsAt = addMinutes(today, -14 * 24 * 60);
  const periodEndsAt = addMinutes(today, 14 * 24 * 60);
  await ensurePerformancePeriod(FIXTURE.performance.periods.current.id, {
    tenantId: company.id,
    name: FIXTURE.performance.periods.current.name,
    startsAt: periodStartsAt,
    endsAt: periodEndsAt,
    status: "OPEN",
  });
  await ensureCompensationRule(FIXTURE.compensation.rules.technician.id, {
    tenantId: company.id,
    name: FIXTURE.compensation.rules.technician.name,
    roleType: "TECHNICIAN",
    active: true,
    metricType: "JOBS_COMPLETED",
    calculationType: "THRESHOLD_BONUS",
    thresholdJson: {
      minimum: 1,
    },
    payoutJson: {
      amountCents: 7500,
      stepAmountCents: 7500,
    },
  });
  await ensureCompensationRun(FIXTURE.compensation.runs.technicianDraft.id, {
    tenantId: company.id,
    periodId: FIXTURE.performance.periods.current.id,
    userId: technicianUser.id,
    ruleId: FIXTURE.compensation.rules.technician.id,
    status: "DRAFT",
    amountCents: 7500,
    currency: "GBP",
    calculationJson: {
      metricType: "JOBS_COMPLETED",
      metricValue: 1,
      minimum: 1,
      metThreshold: true,
      amountCents: 7500,
      seeded: true,
    },
  });

  await ensurePlatformBillingCatalogFixtures(platformAdminUser.id);
  await ensurePlatformSafeErrorLogs(platformAdminUser.id);

  console.log(`tenant=${company.id} (${company.name})`);
  console.log(`operator_email=${FIXTURE.operator.email}`);
  console.log(`dispatcher_email=${FIXTURE.workspaceUsers.dispatcher.email}`);
  console.log(`workspace_admin_email=${FIXTURE.workspaceUsers.admin.email}`);
  console.log(`finance_email=${FIXTURE.workspaceUsers.finance.email}`);
  console.log(`technician_email=${FIXTURE.workspaceUsers.technician.email}`);
  console.log(`external_operator_email=${FIXTURE.workspaceUsers.externalOperator.email}`);
  console.log(`viewer_email=${FIXTURE.workspaceUsers.viewer.email}`);
  console.log(`password_reset_email=${FIXTURE.workspaceUsers.passwordReset.email}`);
  console.log(`platform_admin_email=${FIXTURE.platformAdmin.email}`);
  console.log(`platform_staff_verified_email=${FIXTURE.platformStaff.verified.email}`);
  console.log(`platform_staff_unverified_email=${FIXTURE.platformStaff.unverified.email}`);
  console.log(`support_email=${FIXTURE.supportAccount.user.email}`);
  console.log(`convertible_booking=${FIXTURE.bookings.convertible.id}`);
  console.log(`blocked_booking=${FIXTURE.bookings.blocked.id}`);
  console.log(`invoice_ready_job=${invoiceReadyJob.jobRef}`);
  console.log(`issued_job=${issuedJob.jobRef}`);
  console.log(`finance_ready_job=${financeReadyJob.jobRef}`);
  console.log(`portal_active_job=${portalActiveJob.jobRef}`);
  console.log(`customer_workspace_email=${FIXTURE.customerWorkspace.activeAccount.email}`);
  console.log(`technician_job=${technicianJob.jobRef}`);
  console.log(`technician_role_job=${technicianRoleJob.jobRef}`);
  console.log(`command_centre_job=${openJob.jobRef}`);
}

main()
  .catch((error) => {
    console.error("E2E fixture seed failed.");
    if (error?.message) console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
