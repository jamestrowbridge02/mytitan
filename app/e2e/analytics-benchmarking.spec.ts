import fs from "fs";
import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

const DEFAULT_ANALYTICS_WIDGET_ORDER = [
  "executive-summary",
  "pressure-panel",
  "revenue-panel",
  "capacity-panel",
  "benchmark-delta",
  "customer-commercial-signals",
];

function readStoredOperatorToken() {
  const state = JSON.parse(fs.readFileSync(authFile, "utf8"));
  const origin = Array.isArray(state?.origins)
    ? state.origins.find((entry: any) => entry?.origin === "http://127.0.0.1:3001")
    : null;
  const tokenEntry = Array.isArray(origin?.localStorage)
    ? origin.localStorage.find((entry: any) => entry?.name === "mytitan_token")
    : null;
  const token = String(tokenEntry?.value || "");
  if (!token) {
    throw new Error("Stored operator auth token missing from Playwright state");
  }
  return token;
}

const operatorHeaders = {
  Authorization: `Bearer ${readStoredOperatorToken()}`,
  "Content-Type": "application/json",
};

async function resetAnalyticsWorkspace(request: any) {
  const settingsResponse = await requestLocalApi(request, "/tenant/settings", {
    headers: operatorHeaders,
  });
  expect(settingsResponse.ok()).toBeTruthy();
  const settings = await settingsResponse.json();
  const currentBusinessConfig =
    settings?.businessConfigJson && typeof settings.businessConfigJson === "object"
      ? settings.businessConfigJson
      : {};

  const updateResponse = await requestLocalApi(request, "/tenant/settings", {
    method: "PATCH",
    headers: operatorHeaders,
    data: {
      businessConfigJson: {
        ...currentBusinessConfig,
        analytics: {
          widgetOrder: DEFAULT_ANALYTICS_WIDGET_ORDER,
          hiddenWidgets: [],
          defaultWindowDays: 30,
        },
      },
    },
  });
  expect(updateResponse.ok()).toBeTruthy();
}

async function waitForAnalyticsSurface(page: any) {
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Loading analytics", exact: true })).toHaveCount(0, { timeout: 30000 });
}

test.describe("analytics and benchmarking", () => {
  test.describe.configure({ timeout: 120000 });
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test.beforeEach(async ({ page, request }) => {
    await resetAnalyticsWorkspace(request);
    await page.addInitScript(() => {
      window.localStorage.setItem("mytitan_active_location_id_v1", "all");
    });
  });

  test("analytics page renders executive summary and benchmark deltas", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    await waitForAnalyticsSurface(page);
    await expect(page.getByRole("heading", { name: "Business pulse" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Executive summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Benchmarks and trend deltas" })).toBeVisible();
    await expect(page.getByText(/vs previous 7 days|vs previous 30 days/i).first()).toBeVisible();
  });

  test("pressure, revenue, and capacity panels appear with seeded signal", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    await waitForAnalyticsSurface(page);
    await expect(page.getByRole("heading", { name: "Operational view" })).toBeVisible();
    await expect(page.getByTestId("analytics-chart-completed-jobs")).toContainText(/Jobs completed/i);
    await expect(page.getByTestId("analytics-chart-revenue-funnel")).toContainText(/Revenue funnel/i);
    await expect(page.getByTestId("analytics-chart-overdue-payments")).toContainText(/Overdue payments/i);
    await expect(page.getByTestId("analytics-chart-booking-conversion")).toContainText(/Booking conversion/i);
    await expect(page.getByTestId("analytics-chart-technician-workload")).toContainText(/Technician workload/i);
    await expect(page.getByTestId("analytics-chart-job-pack-usage")).toContainText(/Job-pack usage/i);
    await expect(page.getByRole("heading", { name: "Pressure areas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revenue and collections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capacity and recurring execution" })).toBeVisible();
    await expect(page.getByTestId("analytics-revenue-panel").getByText(/overdue|invoice|quote/i).first()).toBeVisible();
    await expect(page.getByTestId("analytics-capacity-panel").getByText(/unassigned due work|overloaded days|recurring/i).first()).toBeVisible();
  });

  test("analytics layout customization persists from settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=general");
    await expect(page.getByRole("heading", { name: "Workspace settings", exact: true })).toBeVisible();
    const customerSignalsRow = page.getByTestId("settings-analytics-layout-row-customer-commercial-signals");
    const normalizeButton = customerSignalsRow.getByRole("button", { name: /Hide panel|Show panel/ });
    await normalizeButton.scrollIntoViewIfNeeded();
    const normalizeLabel = await normalizeButton.textContent();
    if ((normalizeLabel || "").includes("Show")) {
      await normalizeButton.click();
      await page.getByTestId("settings-save-button").click();
      await expect(page.getByTestId("operator-notice-success")).toContainText(/settings saved/i, { timeout: 30000 });
      await page.goto("/dashboard/settings?tab=general");
    }

    const refreshedCustomerSignalsRow = page.getByTestId("settings-analytics-layout-row-customer-commercial-signals");
    const hideButton = refreshedCustomerSignalsRow.getByRole("button", { name: "Hide panel" });
    await hideButton.scrollIntoViewIfNeeded();
    await hideButton.click();
    await page.getByTestId("settings-save-button").click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/settings saved/i, { timeout: 30000 });
    await page.goto("/dashboard/analytics");
    await waitForAnalyticsSurface(page);
    await expect(page.getByTestId("analytics-customer-commercial-signals")).toHaveCount(0);

    await page.goto("/dashboard/settings?tab=general");
    const showButton = page
      .getByTestId("settings-analytics-layout-row-customer-commercial-signals")
      .getByRole("button", { name: "Show panel" });
    await expect(showButton).toBeVisible();
    await showButton.click();
    await expect(page.getByTestId("settings-save-button")).toBeEnabled();
    await page.getByTestId("settings-save-button").click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/settings saved/i, { timeout: 30000 });
    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
    await expect(page.getByTestId("analytics-customer-commercial-signals")).toBeVisible({ timeout: 20000 });
  });

  test("analytics reset restores hidden panels and default window from settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=general");
    await page.getByTestId("settings-analytics-window-default").selectOption("60");
    const customerSignalsRow = page.getByTestId("settings-analytics-layout-row-customer-commercial-signals");
    await customerSignalsRow.getByRole("button", { name: /Hide panel|Show panel/ }).click();
    await page.getByTestId("settings-save-button").click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/settings saved/i, { timeout: 30000 });
    await page.goto("/dashboard/analytics");
    await waitForAnalyticsSurface(page);
    await expect(page.getByTestId("analytics-window-range")).toHaveValue("60");
    await expect(page.getByTestId("analytics-customer-commercial-signals")).toHaveCount(0);
    await page.goto("/dashboard/settings?tab=general");
    await expect(page.getByTestId("settings-analytics-layout-reset")).toBeVisible();
    await page.getByTestId("settings-analytics-layout-reset").click();
    await page.getByTestId("settings-save-button").click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/settings saved/i, { timeout: 30000 });
    await page.goto("/dashboard/analytics");
    await expect(page.getByTestId("analytics-window-range")).toHaveValue("30");
    await expect(page.getByTestId("analytics-customer-commercial-signals")).toBeVisible();
  });

  test("executive alias route resolves to analytics surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/executive");
    await waitForAnalyticsSurface(page);
    await expect(page.getByRole("heading", { name: "Executive summary" })).toBeVisible();
  });

  test("customer detail shows commercial summary seeded by analytics", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/customers/e2e-portal-active");
    await expect(page.getByTestId("customer-commercial-summary")).toBeVisible();
    await expect(page.getByTestId("customer-commercial-summary")).toContainText(/quotes|service plans|unpaid invoices|overdue balance/i);
  });
});
