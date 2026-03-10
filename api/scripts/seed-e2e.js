#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const FIXTURE = {
  company: {
    id: "e2e-company",
    name: "__E2E MyTitan Workspace",
    timezone: "UTC",
    currency: "GBP",
  },
  location: {
    id: "e2e-location-hq",
    name: "E2E HQ",
  },
  operator: {
    id: "e2e-user-operator",
    email: "e2e.operator@mytitan.local",
    password: "MyTitanE2E!2026",
    role: "OWNER",
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
  },
  jobs: {
    invoiceReady: { id: "e2e-job-invoice-ready", jobRef: "E2E-INV-READY-001" },
    issued: { id: "e2e-job-issued", jobRef: "E2E-ISSUED-001" },
    portalActive: { id: "e2e-job-portal-active", jobRef: "E2E-PORTAL-ACTIVE-001" },
    portalExpired: { id: "e2e-job-portal-expired", jobRef: "E2E-PORTAL-EXPIRED-001" },
    technician: { id: "e2e-job-technician", jobRef: "E2E-TECH-001" },
    automation: { id: "e2e-job-automation", jobRef: "E2E-AUTO-001" },
    open: { id: "e2e-job-open", jobRef: "E2E-OPEN-001" },
  },
  bookings: {
    convertible: { id: "e2e-booking-convertible" },
    blocked: { id: "e2e-booking-blocked" },
    technician: { id: "e2e-booking-technician" },
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

async function ensurePlan() {
  const plan = await prisma.plan.findFirst({ where: { code: "SOLE_TRADER" } });
  return plan?.id || null;
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

async function ensureLocation(companyId) {
  return prisma.location.upsert({
    where: { id: FIXTURE.location.id },
    create: {
      id: FIXTURE.location.id,
      companyId,
      name: FIXTURE.location.name,
      addressLine1: "1 E2E Way",
      city: "London",
      postalCode: "E20 1AA",
      country: "GB",
      timezone: "Europe/London",
    },
    update: {
      companyId,
      name: FIXTURE.location.name,
      addressLine1: "1 E2E Way",
      city: "London",
      postalCode: "E20 1AA",
      country: "GB",
      timezone: "Europe/London",
    },
  });
}

async function ensureOperator(companyId, locationId) {
  const passwordHash = await bcrypt.hash(FIXTURE.operator.password, 10);
  const user = await prisma.user.upsert({
    where: { id: FIXTURE.operator.id },
    create: {
      id: FIXTURE.operator.id,
      companyId,
      email: FIXTURE.operator.email,
      emailVerified: true,
      passwordHash,
      role: FIXTURE.operator.role,
      defaultLocationId: locationId,
      lastActiveAt: new Date(),
      lastLoginAt: new Date(),
    },
    update: {
      companyId,
      email: FIXTURE.operator.email,
      emailVerified: true,
      passwordHash,
      role: FIXTURE.operator.role,
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
      featureCustomerPortal: true,
      featurePayments: true,
      bookingPublicEnabled: true,
      bookingPublicToken: token,
      bookingIcsToken: icsToken,
      onboardingCompleted: true,
      onboardingStep: 5,
      brandPrimaryColor: "#4fd1c5",
      supportPhone: "+44 20 7946 0101",
      primaryTrade: "WHEELS",
      businessConfigJson: {
        defaults: { commandCentreVersion: "v2" },
        navigation: { showIntelligence: true, showPortalOps: true, showTechnicianQueue: true },
        workflowStages: {
          bookings: [
            { id: "lead", label: "Lead Intake", statuses: ["PENDING", "PLANNED"], visible: true },
            { id: "scheduled", label: "Confirmed Visit", statuses: ["CONFIRMED"], visible: true },
            { id: "working", label: "On Site", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Finished", statuses: ["COMPLETED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
          jobs: [
            { id: "ready", label: "Ready for Dispatch", statuses: ["OPEN"], visible: true, requiredCustomFieldKeys: ["serial_number"] },
            { id: "scheduled", label: "Booked In", statuses: ["SCHEDULED"], visible: true },
            { id: "in_progress", label: "Work Underway", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Ready to Bill", statuses: ["COMPLETED", "INVOICED"], visible: true, requiredCustomFieldKeys: ["warranty_status"] },
            { id: "cancelled", label: "Closed Out", statuses: ["CANCELLED"], visible: true },
          ],
          technician: [
            { id: "dispatch", label: "Awaiting Arrival", statuses: ["OPEN", "SCHEDULED"], visible: true, requiredCustomFieldKeys: ["certification"] },
            { id: "working", label: "Working On Site", statuses: ["IN_PROGRESS"], visible: true },
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
      featureCustomerPortal: true,
      featurePayments: true,
      bookingPublicEnabled: true,
      bookingPublicToken: token,
      bookingIcsToken: icsToken,
      onboardingCompleted: true,
      onboardingStep: 5,
      brandPrimaryColor: "#4fd1c5",
      supportPhone: "+44 20 7946 0101",
      primaryTrade: "WHEELS",
      businessConfigJson: {
        defaults: { commandCentreVersion: "v2" },
        navigation: { showIntelligence: true, showPortalOps: true, showTechnicianQueue: true },
        workflowStages: {
          bookings: [
            { id: "lead", label: "Lead Intake", statuses: ["PENDING", "PLANNED"], visible: true },
            { id: "scheduled", label: "Confirmed Visit", statuses: ["CONFIRMED"], visible: true },
            { id: "working", label: "On Site", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Finished", statuses: ["COMPLETED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
          jobs: [
            { id: "ready", label: "Ready for Dispatch", statuses: ["OPEN"], visible: true, requiredCustomFieldKeys: ["serial_number"] },
            { id: "scheduled", label: "Booked In", statuses: ["SCHEDULED"], visible: true },
            { id: "in_progress", label: "Work Underway", statuses: ["IN_PROGRESS"], visible: true },
            { id: "completed", label: "Ready to Bill", statuses: ["COMPLETED", "INVOICED"], visible: true, requiredCustomFieldKeys: ["warranty_status"] },
            { id: "cancelled", label: "Closed Out", statuses: ["CANCELLED"], visible: true },
          ],
          technician: [
            { id: "dispatch", label: "Awaiting Arrival", statuses: ["OPEN", "SCHEDULED"], visible: true, requiredCustomFieldKeys: ["certification"] },
            { id: "working", label: "Working On Site", statuses: ["IN_PROGRESS"], visible: true },
            { id: "finished", label: "Field Complete", statuses: ["COMPLETED", "INVOICED"], visible: true },
            { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"], visible: true },
          ],
        },
      },
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
        notIn: ["e2e-rule-booking-dispatch"],
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

async function ensureCustomers(companyId) {
  const customers = {};
  for (const [key, value] of Object.entries(FIXTURE.customers)) {
    customers[key] = await prisma.customer.upsert({
      where: { companyId_slug: { companyId, slug: value.slug } },
      create: {
        id: value.id,
        companyId,
        slug: value.slug,
        name: value.name,
        email: value.email,
        phone: value.phone,
      },
      update: {
        name: value.name,
        email: value.email,
        phone: value.phone,
      },
    });
  }
  return customers;
}

async function ensureJob({ companyId, locationId, userId, customerId, jobId, jobRef, status, customerName, customerEmail, customerPhone, totalCents, scheduledAt, completedAt, invoiceIssuedAt, invoiceDueAt, invoicePaidAt, approvedAt, approvedByName, signedAt, signatureName, signatureDataUrl, paymentLinkUrl, paymentReceiptUrl, invoicePdfUrl, paymentCheckoutSessionId, serviceName, vehicleMake, vehicleModel, vehicleReg, formData, whatsappCompletionLink, assignedUserId }) {
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
  await prisma.customField.deleteMany({
    where: {
      tenantId: companyId,
      id: { notIn: baselineIds },
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
  const location = await ensureLocation(company.id);
  const operator = await ensureOperator(company.id, location.id);
  const planId = await ensurePlan();

  await ensureInvoiceCounter(company.id);
  await ensureTenantSettings(company.id, location.id, planId);
  await ensureAutomations(company.id);
  await resetCustomFields(company.id);
  const service = await ensureService(company.id);
  const customers = await ensureCustomers(company.id);

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
    assignedUserId: null,
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
    locationId: location.id,
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

  await ensureJobActivity(company.id, invoiceReadyJob.id, operator.id, "e2e-activity-invoice-ready-complete", "job.status", "Job completed and ready for invoice", addMinutes(now, -170));
  await ensureJobActivity(company.id, issuedJob.id, operator.id, "e2e-activity-issued-invoice", "billing.invoice.issued", "Invoice issued to customer", addMinutes(now, -235));
  await ensureJobActivity(company.id, issuedJob.id, operator.id, "e2e-activity-issued-follow-up", "job.reminder.create", "Billing follow-up queued", addMinutes(now, -200));
  await ensureJobActivity(company.id, portalActiveJob.id, operator.id, "e2e-activity-portal-active", "portal.link.ensure", "Portal link prepared for customer", addMinutes(now, -95));
  await ensureJobActivity(company.id, portalExpiredJob.id, operator.id, "e2e-activity-portal-expired", "billing.payment.received", "Payment received and receipt stored", addMinutes(now, -25));
  await ensureJobActivity(company.id, technicianJob.id, operator.id, "e2e-activity-tech-arrived", "tech.arrived", "Technician arrived on site", addMinutes(now, -15));
  await ensureJobActivity(company.id, technicianJob.id, operator.id, "e2e-activity-tech-note", "tech.note", "Customer requested extra care on the front-right wheel.", addMinutes(now, -10));
  await ensureJobActivity(company.id, automationJob.id, operator.id, "e2e-activity-auto-work", "tech.note", "Automation test job is active and ready for completion.", addMinutes(now, -8));
  await ensureJobActivity(company.id, openJob.id, operator.id, "e2e-activity-open", "job.status", "New job created in the command centre queue", addMinutes(now, -60));

  await ensureReminder("e2e-reminder-billing-overdue", company.id, issuedJob.id, addMinutes(now, -180), "Automation billing follow-up");
  await ensureReminder("e2e-reminder-dispatch-overdue", company.id, openJob.id, addMinutes(now, -90), "Automation dispatch follow-up");

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
      locationId: location.id,
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
      locationId: location.id,
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

  console.log(`tenant=${company.id} (${company.name})`);
  console.log(`operator_email=${FIXTURE.operator.email}`);
  console.log(`operator_password=${FIXTURE.operator.password}`);
  console.log(`convertible_booking=${FIXTURE.bookings.convertible.id}`);
  console.log(`blocked_booking=${FIXTURE.bookings.blocked.id}`);
  console.log(`invoice_ready_job=${invoiceReadyJob.jobRef}`);
  console.log(`issued_job=${issuedJob.jobRef}`);
  console.log(`portal_active_job=${portalActiveJob.jobRef}`);
  console.log(`portal_token=${FIXTURE.tokens.active}`);
  console.log(`technician_job=${technicianJob.jobRef}`);
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
