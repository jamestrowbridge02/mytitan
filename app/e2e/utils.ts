import fs from "fs";
import os from "os";
import path from "path";
import type { APIRequestContext, Page, Route } from "@playwright/test";

const LOCAL_API_BASE = "http://127.0.0.1:3000";

export const authDir = process.env.PLAYWRIGHT_AUTH_DIR?.trim() || path.join(os.tmpdir(), "mytitan-playwright");
export const authFile = path.join(authDir, "operator-auth.json");
export const metadataFile = path.join(authDir, "e2e-metadata.json");
export const defaultOperatorEmail = "e2e.operator@mytitan.local";
export const defaultOperatorPassword = "MyTitanE2E!2026";

export const fixtureRefs = {
  convertibleBookingId: "e2e-booking-convertible",
  convertibleCustomerId: "e2e-customer-convertible",
  convertibleCustomerSlug: "e2e-convertible",
  portalExpiredCustomerSlug: "e2e-portal-expired",
  portalExpiredCustomerEmail: "portal-expired@mytitan.local",
  blockedBookingId: "e2e-booking-blocked",
  invoiceReadyJobId: "e2e-job-invoice-ready",
  invoiceReadyJobRef: "E2E-INV-READY-001",
  issuedJobRef: "E2E-ISSUED-001",
  financeReadyJobRef: "E2E-FIN-READY-001",
  portalActiveJobRef: "E2E-PORTAL-ACTIVE-001",
  portalActiveJobId: "e2e-job-portal-active",
  portalExpiredJobRef: "E2E-PORTAL-EXPIRED-001",
  portalExpiredJobId: "e2e-job-portal-expired",
  technicianJobRef: "E2E-TECH-001",
  technicianJobId: "e2e-job-technician",
  technicianRoleJobRef: "E2E-TECH-ROLE-001",
  automationJobRef: "E2E-AUTO-001",
  commandCentreJobRef: "E2E-OPEN-001",
  commandCentreJobId: "e2e-job-open",
  automationJobId: "e2e-job-automation",
  financeJobId: "e2e-job-finance-ready",
  technicianRoleJobId: "e2e-job-technician-role",
  portalToken: "e2e-public-portal-token",
  automationSuggestionKey: "invoice-overdue-follow-up",
  dismissedAutomationSuggestionKey: "technician-arrival-office-notify",
  customFieldJobSerialKey: "serial_number",
  customFieldWarrantyKey: "warranty_status",
  customFieldCustomerSiteCode: "site_code",
  seededWebhookName: "E2E Operations Webhook",
  passwordResetEmail: "e2e.password.reset@mytitan.example",
  passwordResetPassword: "MyTitanReset!2026",
  seededApiTokenName: "E2E Primary Token",
  seededJobArtifactLabel: "Seeded invoice pack",
  seededPortalArtifactLabel: "Customer completion summary",
  seededCustomerArtifactLabel: "Customer warranty note",
  technicianExecutionRecordId: "e2e-job-execution-technician-draft",
  portalExecutionRecordId: "e2e-job-execution-portal-submitted",
  draftQuoteId: "e2e-quote-draft",
  draftQuoteNumber: "Q-2026-00010",
  sentQuoteId: "e2e-quote-sent",
  sentQuoteNumber: "Q-2026-00011",
  approvedQuoteId: "e2e-quote-approved",
  approvedQuoteNumber: "Q-2026-00012",
  overdueRevenueTaskId: "e2e-revenue-task-overdue-invoice",
  activeServicePlanId: "e2e-service-plan-active",
  pausedServicePlanId: "e2e-service-plan-paused",
  portalRenewalPlanId: "e2e-service-plan-portal-renewal",
  activeServicePlanName: "Quarterly Vehicle Health Check",
  pausedServicePlanName: "Annual Warranty Review",
  portalRenewalPlanName: "Semi-Annual Compliance Review",
  pendingServicePlanRenewalId: "e2e-service-plan-renewal-portal-pending",
  openServicePlanRequestId: "e2e-service-plan-request-customer-open",
  schedulingHealthyTechnicianEmail: "e2e.operator@mytitan.local",
  schedulingOverloadedTechnicianEmail: "e2e.technician@mytitan.local",
  schedulingUnassignedJobId: "e2e-job-open",
  schedulingOverloadedReason: "Parts collection blocks most of the morning",
  dispatcherEmail: "e2e.dispatcher@mytitan.local",
  dispatcherPassword: "MyTitanE2EDispatch!2026",
  workspaceAdminEmail: "e2e.admin@mytitan.local",
  workspaceAdminPassword: "MyTitanE2EAdmin!2026",
  financeEmail: "e2e.finance@mytitan.local",
  financePassword: "MyTitanE2EFinance!2026",
  technicianEmail: "e2e.technician@mytitan.local",
  technicianPassword: "MyTitanE2ETech!2026",
  externalOperatorEmail: "e2e.external@mytitan.local",
  externalOperatorPassword: "MyTitanE2EExternal!2026",
  viewerEmail: "e2e.viewer@mytitan.local",
  viewerPassword: "MyTitanE2EViewer!2026",
  platformAdminEmail: "admin@mytitan.co.uk",
  platformAdminPassword: "MyTitanE2EPlatform!2026",
  supportOwnerEmail: "support@mytitan.co.uk",
  supportOwnerPassword: "MyTitanSupport!2026",
  customerWorkspaceEmail: "portal-active@mytitan.local",
  customerWorkspacePassword: "MyTitanCustomer!2026",
  customerWorkspaceInviteToken: "custinvite_e2e_customer_invited",
  blockedCustomerSlug: "e2e-blocked",
  portalActiveCustomerId: "e2e-customer-portal-active",
  lowStockPartSku: "E2E-LACQUER",
  lowStockPartName: "Protective Lacquer",
  reservedPartSku: "E2E-ALLOY-KIT",
  plannedPartSku: "E2E-BOLTS",
  inventoryWarehouseName: "Main Warehouse",
  inventoryVanName: "Technician Van 01",
  openPurchaseOrderId: "e2e-po-open",
  hqLocationName: "E2E HQ",
  northLocationName: "E2E North Branch",
  complianceQuotePolicyName: "Quote approval response",
  complianceServicePlanPolicyName: "Service plan execution follow-through",
  complianceBreachedQuoteNumber: "Q-2026-00011",
  complianceOpenServicePlanName: "Semi-Annual Compliance Review",
  complianceOpenManualOverrideId: "e2e-compliance-exception-open-manual-override",
  complianceOpenEvidenceReviewId: "e2e-compliance-exception-open-evidence-review",
  complianceOpenExceptionSummary: "Manual override on finance-ready workflow needs operator review",
  complianceDismissExceptionSummary: "Portal-active completion evidence review is awaiting operator acknowledgement",
  complianceResolvedExceptionSummary: "Issued invoice review has already been closed out",
  performancePeriodName: "E2E March Ops Window",
  compensationRuleName: "Technician completion bonus",
};

export const workspaceAdminEmail = fixtureRefs.workspaceAdminEmail;
export const workspaceAdminPassword = fixtureRefs.workspaceAdminPassword;

export type E2EMetadata = {
  email?: string | null;
  authReady?: boolean;
  portalUrl?: string | null;
  portalToken?: string | null;
};

export function hasDashboardAuth() {
  const metadata = readMetadata();
  return Boolean(metadata.authReady);
}

export function readMetadata(): E2EMetadata {
  try {
    const raw = fs.readFileSync(metadataFile, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

const apiOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "https://api.mytitan.co.uk",
];

const e2eBaseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3101";
const e2eOrigin = new URL(e2eBaseURL).origin;

export function resolveE2EAppUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value) return value;
  try {
    const parsed = new URL(value, e2eOrigin);
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, e2eOrigin).toString();
  } catch {
    return value;
  }
}

async function fulfillFromLocalApi(route: Route, request: APIRequestContext) {
  const originalUrl = new URL(route.request().url());
  let response;
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await request.fetch(`${LOCAL_API_BASE}${originalUrl.pathname}${originalUrl.search}`, {
        method: route.request().method(),
        headers: {
          ...route.request().headers(),
          host: "127.0.0.1:3000",
          origin: e2eOrigin,
          referer: `${e2eOrigin}/`,
        },
        data: route.request().postDataBuffer() ?? undefined,
        failOnStatusCode: false,
      });
      break;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      if (
        message.includes("Request context disposed") ||
        message.includes("Target page, context or browser has been closed")
      ) {
        await route.abort();
        return;
      }
      if (!message.includes("socket hang up") && !message.includes("ECONNRESET")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  if (!response) {
    throw lastError;
  }
  const headers = response.headers();
  const contentType = headers["content-type"] || "application/json; charset=utf-8";
  let body: Buffer;
  try {
    body = await response.body();
  } catch (error: any) {
    const message = String(error?.message || "");
    if (
      message.includes("Request context disposed") ||
      message.includes("Response has been disposed") ||
      message.includes("Target page, context or browser has been closed")
    ) {
      await route.abort();
      return;
    }
    throw error;
  }

  await route.fulfill({
    status: response.status(),
    contentType,
    headers: {
      "access-control-allow-origin": e2eOrigin,
      "access-control-allow-credentials": "true",
    },
    body,
  });
}

export async function installApiProxy(page: Page, request: APIRequestContext) {
  for (const origin of apiOrigins) {
    await page.route(`${origin}/**`, async (route) => {
      await fulfillFromLocalApi(route, request);
    });
  }
}

export async function requestLocalApi(
  request: APIRequestContext,
  path: string,
  init: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  let response = null as Awaited<ReturnType<APIRequestContext["fetch"]>> | null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.fetch(`${LOCAL_API_BASE}${path}`, {
        failOnStatusCode: false,
        ...init,
      });
      break;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      if (
        message.includes("Request context disposed") ||
        message.includes("Target page, context or browser has been closed")
      ) {
        throw error;
      }
      if (!message.includes("socket hang up") && !message.includes("ECONNRESET")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  if (!response) {
    throw lastError;
  }
  return response;
}

export async function loginAs(page: Page, request: APIRequestContext, email: string, password: string) {
  let response = null as Awaited<ReturnType<APIRequestContext["post"]>> | null;
  let lastStatus = 0;
  let lastBody = "";
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.post("http://127.0.0.1:3000/auth/login", {
        data: { email, password },
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      if (!message.includes("socket hang up") && !message.includes("ECONNRESET") && !message.includes("ECONNREFUSED")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      continue;
    }
    lastStatus = response.status();
    if (response.ok()) {
      break;
    }
    lastBody = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  if (!response?.ok()) {
    if (!response && lastError) {
      throw lastError;
    }
    throw new Error(`Failed to log in as ${email} (status ${lastStatus}${lastBody ? `: ${lastBody}` : ""})`);
  }
  const body = await response.json();
  const token = String(body?.token || "");
  if (!token) {
    throw new Error(`Auth token missing for ${email}`);
  }
  await page.addInitScript((nextToken) => {
    window.localStorage.setItem("mytitan_token", nextToken);
  }, token);
  return token;
}

export async function cleanupGeneratedWorkspace(request: APIRequestContext, token: string) {
  const response = await request.post("http://127.0.0.1:3000/me/e2e-cleanup-generated-workspace", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {},
  });
  if (!response.ok()) {
    throw new Error(`generated workspace cleanup failed with status ${response.status()}`);
  }
}

export async function loginCustomerAs(page: Page, request: APIRequestContext, email: string, password: string) {
  let response = null as Awaited<ReturnType<APIRequestContext["post"]>> | null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await request.post("http://127.0.0.1:3000/customer-auth/login", {
        data: { email, password },
        headers: { "Content-Type": "application/json" },
      });
      break;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      if (!message.includes("socket hang up") && !message.includes("ECONNRESET") && !message.includes("ECONNREFUSED")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  if (!response) {
    throw lastError instanceof Error ? lastError : new Error(`Failed to log in customer ${email}`);
  }
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to log in customer ${email} (${response.status()}: ${body})`);
  }
  const body = await response.json();
  const token = String(body?.token || "");
  if (!token) {
    throw new Error(`Customer token missing for ${email}`);
  }
  await page.addInitScript((nextToken) => {
    window.localStorage.setItem("mytitan_customer_token", nextToken);
  }, token);
}
