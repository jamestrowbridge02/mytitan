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
  commandCentreJobRef: "E2E-OPEN-001",
  portalToken: "e2e-public-portal-token",
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

async function fulfillFromLocalApi(route: Route, request: APIRequestContext) {
  const originalUrl = new URL(route.request().url());
  const response = await request.fetch(`http://127.0.0.1:3000${originalUrl.pathname}${originalUrl.search}`, {
    method: route.request().method(),
    headers: {
      ...route.request().headers(),
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3101",
      referer: "http://127.0.0.1:3101/",
    },
    data: route.request().postDataBuffer() ?? undefined,
    failOnStatusCode: false,
  });
  const headers = response.headers();
  const contentType = headers["content-type"] || "application/json; charset=utf-8";

  await route.fulfill({
    status: response.status(),
    contentType,
    headers: {
      "access-control-allow-origin": "http://127.0.0.1:3101",
      "access-control-allow-credentials": "true",
    },
    body: await response.body(),
  });
}

export async function installApiProxy(page: Page, request: APIRequestContext) {
  for (const origin of apiOrigins) {
    await page.route(`${origin}/**`, async (route) => {
      await fulfillFromLocalApi(route, request);
    });
  }
}
