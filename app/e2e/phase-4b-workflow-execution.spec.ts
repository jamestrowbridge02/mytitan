import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const TENANT_ID = "e2e-company";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

function expectNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("access_token");
  expect(serialized).not.toContain("refresh_token");
  expect(serialized).not.toContain("client_secret");
  expect(serialized).not.toContain("sk_live_");
  expect(serialized).not.toContain("sk_test_");
  expect(serialized).not.toContain("whsec_");
}

test.describe("Phase 4B workflow execution", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("support mode requires reason, blocks silent tenant data access, exits, and expires", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, { method: "DELETE", headers });

    const blocked = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(blocked.status()).toBe(403);

    const missingReason = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, {
      method: "POST",
      headers,
      data: { reason: "short", durationMinutes: 5 },
    });
    expect(missingReason.status()).toBe(400);

    const started = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, {
      method: "POST",
      headers,
      data: { reason: "E2E support investigation", durationMinutes: 5 },
    });
    expect(started.ok()).toBeTruthy();

    const detail = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    expect(detailJson?.support?.supportMode?.active).toBe(true);
    expectNoSecrets(detailJson);

    const exited = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, { method: "DELETE", headers });
    expect(exited.ok()).toBeTruthy();
    expect((await exited.json())?.exited).toBe(true);
    const blockedAfterExit = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(blockedAfterExit.status()).toBe(403);

    const expiring = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, {
      method: "POST",
      headers,
      data: { reason: "E2E expiry investigation", durationSeconds: 1 },
    });
    expect(expiring.ok()).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const blockedAfterExpiry = await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(blockedAfterExpiry.status()).toBe(403);
  });

  test("platform UI starts and exits timed support mode before tenant detail is visible", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await requestLocalApi(request, `/admin/platform/tenants/${TENANT_ID}/support-mode`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await page.goto("/platform", { waitUntil: "networkidle" });

    await page.getByTestId("platform-tenant-search-input").fill("E2E MyTitan Workspace");
    await page.getByTestId("platform-tenant-search-submit").click();
    await page.getByTestId(`platform-tenant-result-${TENANT_ID}`).click();
    await expect(page.getByTestId("platform-support-mode-panel")).toBeVisible();
    await expect(page.getByTestId("platform-pricing-controls")).toHaveCount(0);

    await page.getByTestId("platform-support-mode-reason").fill("E2E UI support investigation");
    await page.getByTestId("platform-support-mode-start").click();
    await expect(page.getByTestId("platform-support-mode-banner")).toContainText("Timed tenant access expires");
    await expect(page.getByTestId("platform-pricing-controls")).toBeVisible();

    await page.getByTestId("platform-support-mode-exit").click();
    await expect(page.getByTestId("platform-support-mode-start")).toBeVisible();
    await expect(page.getByTestId("platform-pricing-controls")).toHaveCount(0);
  });

  test("tenant enterprise UI renders Phase 4 readiness without platform controls and deep-links exact workflows", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });

    await expect(page.getByTestId("phase4-overview-ui")).toBeVisible();
    await expect(page.getByTestId("platform-support-mode-panel")).toHaveCount(0);
    await expect(page.getByText("Start timed support mode")).toHaveCount(0);
    await expect(page.getByTestId("phase4-card-lifecycle")).toHaveAttribute("href", "/dashboard/booking/settings");
    await expect(page.getByTestId("phase4-card-records")).toHaveAttribute("href", "/dashboard/jobs");
    await expect(page.getByTestId("phase4-card-offline")).toHaveAttribute("href", "/dashboard/technician");
    await expect(page.getByTestId("phase4-card-maps")).toHaveAttribute("href", "/dashboard/scheduling");
    await expect(page.getByTestId("phase4-card-portal")).toHaveAttribute("href", "/dashboard/portal");
    await expect(page.getByTestId("phase4-card-forecasting")).toHaveAttribute("href", "/dashboard/analytics");
    await expect(page.getByTestId("phase4-card-growth")).toHaveAttribute("href", "/dashboard/settings/automations");
    await expect(page.getByTestId("phase4-action-low_stock")).toHaveAttribute("href", "/dashboard/inventory");
  });

  test("offline technician workflow queues safe metadata and files for assigned jobs", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });

    await expect(page.getByTestId("offline-mobile-foundation")).toBeVisible();
    await page.locator('[data-testid^="offline-queue-signature-"]').first().click();
    await page.locator('[data-testid^="offline-queue-completion-notes-"]').first().click();
    await page.locator('[data-testid^="offline-queue-material-"]').first().click();
    await page.locator('[data-testid^="offline-queue-payment-"]').first().click();

    const file = { name: "before-photo.txt", mimeType: "text/plain", buffer: Buffer.from("offline evidence") };
    await page.locator('[data-testid^="offline-before-photo-input-"]').first().setInputFiles(file);
    await page.locator('[data-testid^="offline-after-photo-input-"]').first().setInputFiles({ ...file, name: "after-photo.txt" });

    await expect(page.getByTestId("offline-metadata-queue-state")).toContainText("signature metadata");
    await expect(page.getByTestId("offline-metadata-queue-state")).toContainText("completion notes");
    await expect(page.getByTestId("offline-metadata-queue-state")).toContainText("material usage");
    await expect(page.getByTestId("offline-metadata-queue-state")).toContainText("payment note");
    await expect(page.getByTestId("offline-binary-queue-state")).toContainText("before photo");
    await expect(page.getByTestId("offline-binary-queue-state")).toContainText("after photo");

    const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
    expectNoSecrets(storage);
    await page.getByTestId("offline-clear-metadata-queue").click();
    await expect(page.getByTestId("offline-metadata-queue-state")).toHaveCount(0);
  });
});
