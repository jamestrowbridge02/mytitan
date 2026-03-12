import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("analytics and benchmarking", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("analytics page renders executive summary and benchmark deltas", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
    await expect(page.getByTestId("analytics-executive-summary")).toBeVisible();
    await expect(page.getByTestId("analytics-benchmark-delta")).toBeVisible();
    await expect(page.getByTestId("analytics-benchmark-delta")).toContainText(/vs previous 7 days|vs previous 30 days/i);
  });

  test("pressure, revenue, and capacity panels appear with seeded signal", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    await expect(page.getByTestId("analytics-pressure-panel")).toBeVisible();
    await expect(page.getByTestId("analytics-revenue-panel")).toBeVisible();
    await expect(page.getByTestId("analytics-capacity-panel")).toBeVisible();
    await expect(page.getByTestId("analytics-revenue-panel")).toContainText(/overdue|invoice|quote/i);
    await expect(page.getByTestId("analytics-capacity-panel")).toContainText(/unassigned due work|overloaded days|recurring/i);
  });

  test("analytics layout customization persists", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    const controls = page.locator(".operator-section").filter({ hasText: "Analytics controls" }).first();
    const revenueWidgetRow = controls.locator(".integration-card").filter({ hasText: "revenue-panel" }).first();

    const hideButton = revenueWidgetRow.getByRole("button", { name: "Hide widget" });
    await hideButton.scrollIntoViewIfNeeded();
    await hideButton.evaluate((element: HTMLButtonElement) => element.click());
    await page.getByRole("button", { name: "Save layout" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/layout saved/i);
    await page.reload();
    await expect(page.getByTestId("analytics-revenue-panel")).toHaveCount(0);

    const refreshedControls = page.locator(".operator-section").filter({ hasText: "Analytics controls" }).first();
    const refreshedRevenueRow = refreshedControls.locator(".integration-card").filter({ hasText: "revenue-panel" }).first();
    const showButton = refreshedRevenueRow.getByRole("button", { name: "Show widget" });
    await showButton.scrollIntoViewIfNeeded();
    await showButton.evaluate((element: HTMLButtonElement) => element.click());
    await page.getByRole("button", { name: "Save layout" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/layout saved/i);
    await page.reload();
    await expect(page.getByTestId("analytics-revenue-panel")).toBeVisible();
  });

  test("executive alias route resolves to analytics surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/executive");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
    await expect(page.getByTestId("analytics-executive-summary")).toBeVisible();
  });

  test("customer detail shows commercial summary seeded by analytics", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/customers/e2e-portal-active");
    await expect(page.getByTestId("customer-commercial-summary")).toBeVisible();
    await expect(page.getByTestId("customer-commercial-summary")).toContainText(/quotes|service plans|unpaid invoices|overdue balance/i);
  });
});
