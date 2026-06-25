import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

const TENANT_ID = "e2e-company";

async function authHeaders(page: any) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function startSupportMode(request: any, headers: Record<string, string>) {
  const response = await request.post(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/support-mode`, {
    headers,
    data: { reason: "E2E pricing support investigation", durationMinutes: 5 },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("pricing adjustments", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated pricing adjustment tests.");

  test("platform admins can apply and remove recurring custom pricing from the dedicated platform surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    const headers = await authHeaders(page);

    await request.delete(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { confirmation: true, reason: "E2E pricing cleanup" },
    });
    await request.delete(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/support-mode`, { headers });

    await page.getByTestId("platform-tenant-search-input").fill("E2E MyTitan Workspace");
    await page.getByTestId("platform-tenant-search-submit").click();
    await page.getByTestId(`platform-tenant-result-${TENANT_ID}`).click();
    await page.getByTestId("platform-support-mode-reason").fill("E2E pricing support investigation");
    await page.getByTestId("platform-support-mode-start").click();

    await expect(page.getByTestId("platform-pricing-adjustment-summary")).toContainText("No custom pricing is active");
    await page.getByTestId("platform-pricing-type").selectOption("percentage");
    await page.getByTestId("platform-pricing-value").fill("15");
    await page.getByTestId("platform-pricing-duration").selectOption("recurring");
    await page.getByTestId("platform-pricing-reason").fill("E2E recurring adjustment");
    await page.getByTestId("platform-pricing-save").click();

    await expect(page.getByTestId("platform-pricing-adjustment-summary")).toContainText("15% off");
    await expect(page.getByTestId("platform-pricing-adjustment-summary")).toContainText("future payments");

    await page.getByTestId("platform-pricing-remove").click();
    await expect(page.getByTestId("platform-pricing-adjustment-summary")).toContainText("No custom pricing is active");
  });

  test("platform pricing state distinguishes one-time and recurring adjustments", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    const headers = await authHeaders(page);

    await request.post(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { type: "fixed", value: 20, duration: "one_time", reason: "E2E one-time", confirmation: true },
    });
    await startSupportMode(request, headers);
    const oneTimeState = await request.get(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(oneTimeState.ok()).toBeTruthy();
    const oneTimeJson = await oneTimeState.json();
    expect(oneTimeJson?.pricingState?.adjustment?.duration).toBe("one_time");
    expect(oneTimeJson?.pricingState?.adjustment?.appliesToNextPayment).toBe(true);
    expect(oneTimeJson?.pricingState?.adjustment?.appliesToFuturePayments).toBe(false);

    await request.patch(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { type: "percentage", value: 12, duration: "recurring", reason: "E2E recurring", confirmation: true },
    });
    const recurringState = await request.get(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(recurringState.ok()).toBeTruthy();
    const recurringJson = await recurringState.json();
    expect(recurringJson?.pricingState?.adjustment?.duration).toBe("recurring");
    expect(recurringJson?.pricingState?.adjustment?.appliesToNextPayment).toBe(true);
    expect(recurringJson?.pricingState?.adjustment?.appliesToFuturePayments).toBe(true);

    await request.delete(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { confirmation: true, reason: "E2E pricing cleanup" },
    });
  });

  test("platform pricing state preserves until-date expiry details", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    const headers = await authHeaders(page);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const applyResponse = await request.post(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { type: "percentage", value: 8, duration: "until_date", expiresAt: tomorrow, reason: "E2E expiry", confirmation: true },
    });
    expect(applyResponse.ok()).toBeTruthy();
    await startSupportMode(request, headers);

    const pricingState = await request.get(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}`, { headers });
    expect(pricingState.ok()).toBeTruthy();
    const pricingJson = await pricingState.json();
    expect(pricingJson?.pricingState?.adjustment?.duration).toBe("until_date");
    expect(pricingJson?.pricingState?.adjustment?.status).toBe("active");
    expect(pricingJson?.pricingState?.adjustment?.expiresAt).toContain(tomorrow.slice(0, 10));
    expect(Number(pricingJson?.pricingState?.adjustedPriceCents || 0)).toBeLessThan(Number(pricingJson?.pricingState?.basePriceCents || 0));

    await request.delete(`http://127.0.0.1:3000/admin/platform/tenants/${TENANT_ID}/pricing-adjustment`, {
      headers,
      data: { confirmation: true, reason: "E2E pricing cleanup" },
    });
  });

  test("workspace admins are denied platform pricing controls while customer billing stays clean", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });

    await expect(page.getByTestId("billing-trial-card")).toBeVisible();
    await expect(page.getByTestId("billing-custom-pricing")).toHaveCount(0);

    const headers = await authHeaders(page);
    const billingMe = await request.get("http://127.0.0.1:3000/billing/me", { headers });
    expect(billingMe.ok()).toBeTruthy();
    const billingMeJson = await billingMe.json();
    expect(billingMeJson?.plan?.featuresJson).toBeUndefined();
    expect(billingMeJson?.pricingState).toBeUndefined();
    expect(billingMeJson?.currentFeatureMap).toBeUndefined();
    expect(billingMeJson?.usage).toBeUndefined();
    expect(billingMeJson?.features).toBeUndefined();
    expect(billingMeJson?.viewer?.role).toBe("ADMIN");
    expect(billingMeJson?.viewer?.canManageSubscription).toBe(false);

    const entitlements = await request.get("http://127.0.0.1:3000/me/entitlements", { headers });
    expect(entitlements.ok()).toBeTruthy();
    const entitlementsJson = await entitlements.json();
    expect(typeof entitlementsJson?.planCode).toBe("string");
    expect(entitlementsJson?.features?.bookings_enabled).not.toBeUndefined();
    expect(entitlementsJson?.subscription).toBeUndefined();
    expect(entitlementsJson?.trial).toBeUndefined();
    expect(entitlementsJson?.viewer).toBeUndefined();

    const platformLookup = await request.get("http://127.0.0.1:3000/admin/platform/tenants?q=e2e", { headers });
    expect(platformLookup.status()).toBe(403);
  });

  test("finance users are denied platform pricing controls and tenant UI stays clean", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.financeEmail, fixtureRefs.financePassword);
    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });

    await expect(page.getByTestId("billing-trial-card")).toBeVisible();

    const headers = await authHeaders(page);
    const platformLookup = await request.get("http://127.0.0.1:3000/admin/platform/tenants?q=e2e", { headers });
    expect(platformLookup.status()).toBe(403);
  });
});
