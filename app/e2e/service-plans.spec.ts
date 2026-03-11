import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("service plans", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("plan list and history render", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await expect(page.getByTestId("service-plan-list")).toBeVisible();
    await expect(page.getByText(fixtureRefs.activeServicePlanName)).toBeVisible();
    await expect(page.getByText(fixtureRefs.pausedServicePlanName)).toBeVisible();
    await expect(page.getByTestId("service-plan-history")).toContainText(/EXECUTED/i);
  });

  test("create plan flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await page.getByTestId("service-plan-create").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("service-plan-customer").selectOption(fixtureRefs.convertibleCustomerId);
    await page.getByTestId("service-plan-name").fill("Monthly Filter Refresh");
    await page.getByTestId("service-plan-description").fill("Playwright-created recurring plan");
    await page.getByTestId("service-plan-cadence-unit").selectOption("MONTH");
    await page.getByTestId("service-plan-cadence-interval").fill("1");
    await page.getByTestId("service-plan-next-run").fill("2026-03-20T09:30");
    await page.getByTestId("service-plan-mode").selectOption("job");
    await page.getByTestId("service-plan-tasks").fill("Replace filter\nRecord inspection");
    await page.getByTestId("service-plan-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.locator(".operator-cellTitle", { hasText: "Monthly Filter Refresh" }).first()).toBeVisible();
  });

  test("pause and resume actions work", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    const activeRow = page.getByTestId(`service-plan-row-${fixtureRefs.activeServicePlanId}`);
    await activeRow.getByRole("button", { name: "Pause" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Service plan paused/i)).toBeVisible();
    await expect(page.getByText(fixtureRefs.activeServicePlanName)).toBeVisible();

    const pausedRow = page.getByTestId(`service-plan-row-${fixtureRefs.pausedServicePlanId}`);
    await pausedRow.getByRole("button", { name: "Resume" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Service plan resumed/i)).toBeVisible();
  });

  test("run-now executes the selected plan", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await page.getByTestId(`service-plan-row-${fixtureRefs.pausedServicePlanId}`).evaluate((element: HTMLElement) => element.click());
    await page.getByTestId("service-plan-run-now").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Recurring run executed/i)).toBeVisible();
    await expect(page.getByTestId("service-plan-history")).toContainText(/Booking|Job/i);
  });

  test("customer detail shows linked plans", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/customers/${fixtureRefs.convertibleCustomerSlug}`);
    await expect(page.getByRole("heading", { name: "Service plans" })).toBeVisible();
    await expect(page.getByTestId("customer-service-plans")).toContainText(/Quarterly Vehicle Health Check|recurring plan/i);
  });
});
