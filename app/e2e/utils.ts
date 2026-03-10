import fs from "fs";
import path from "path";
import type { APIRequestContext, Page, Route } from "@playwright/test";

export const authDir = path.join(__dirname, "..", ".playwright");
export const authFile = path.join(authDir, "operator-auth.json");
export const metadataFile = path.join(authDir, "e2e-metadata.json");
export const defaultOperatorEmail = "e2e.operator@mytitan.local";
export const defaultOperatorPassword = "MyTitanE2E!2026";

export const fixtureRefs = {
  convertibleBookingId: "e2e-booking-convertible",
  blockedBookingId: "e2e-booking-blocked",
  invoiceReadyJobRef: "E2E-INV-READY-001",
  issuedJobRef: "E2E-ISSUED-001",
  portalActiveJobRef: "E2E-PORTAL-ACTIVE-001",
  portalExpiredJobRef: "E2E-PORTAL-EXPIRED-001",
  technicianJobRef: "E2E-TECH-001",
  automationJobRef: "E2E-AUTO-001",
  commandCentreJobRef: "E2E-OPEN-001",
  commandCentreJobId: "e2e-job-open",
  automationJobId: "e2e-job-automation",
  portalToken: "e2e-public-portal-token",
  automationSuggestionKey: "invoice-overdue-follow-up",
  dismissedAutomationSuggestionKey: "technician-arrival-office-notify",
  customFieldJobSerialKey: "serial_number",
  customFieldWarrantyKey: "warranty_status",
  customFieldCustomerSiteCode: "site_code",
};

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

async function fulfillFromLocalApi(route: Route, request: APIRequestContext) {
  const originalUrl = new URL(route.request().url());
  let response;
  try {
    response = await request.fetch(`http://127.0.0.1:3000${originalUrl.pathname}${originalUrl.search}`, {
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
  } catch (error: any) {
    const message = String(error?.message || "");
    if (
      message.includes("Request context disposed") ||
      message.includes("Target page, context or browser has been closed")
    ) {
      await route.abort();
      return;
    }
    throw error;
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
