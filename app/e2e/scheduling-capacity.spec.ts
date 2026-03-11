import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("scheduling capacity planning", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("scheduling page renders capacity and pressure views", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/scheduling");
    await expect(page.getByRole("heading", { name: "Scheduling", exact: true })).toBeVisible();
    await expect(page.getByTestId("scheduling-capacity-grid")).toBeVisible();
    await expect(page.getByTestId("scheduling-pressure-list")).toBeVisible();
    await expect(page.getByTestId("scheduling-recommendation-list")).toBeVisible();
  });

  test("capacity indicators show overloaded and unavailable states", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/scheduling");
    await expect(page.getByTestId("scheduling-pressure-list")).toContainText(/Overloaded/i);
    await expect(page.getByTestId("scheduling-pressure-list")).toContainText(/Unavailable|Available/i);
    await expect(page.getByTestId("scheduling-capacity-grid")).toContainText(/Unavailable/i);
  });

  test("recommendations remain visible and explainable for unassigned work", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/scheduling");
    const pressureList = page.getByTestId("scheduling-pressure-list");
    await expect(pressureList).toContainText(/Unassigned|Due work|Recurring/i);
    await pressureList.getByRole("button").first().evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("scheduling-recommendation-list")).toContainText(/Capacity available|Fits remaining capacity|No overlap/i);
  });

  test("availability and exception flows save from the scheduling page", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/scheduling");
    await page.locator("select").nth(0).selectOption("e2e-user-technician");
    await page.locator('input[type="date"]').nth(1).fill("2026-03-13");
    await page.locator('input[type="time"]').nth(0).fill("10:00");
    await page.locator('input[type="time"]').nth(1).fill("12:00");
    await page.locator('input[type="number"]').nth(0).fill("120");
    await page.locator("textarea").nth(0).fill("Playwright extra seeded capacity");
    await page.getByTestId("scheduling-availability-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Availability saved|updated/i);

    await page.locator("select").nth(1).selectOption("e2e-user-technician");
    await page.locator('input[type="date"]').nth(2).fill("2026-03-13");
    await page.locator("select").nth(2).selectOption("OVERTIME");
    await page.locator('input[type="time"]').nth(2).fill("16:00");
    await page.locator('input[type="time"]').nth(3).fill("17:00");
    await page.locator('input[type="number"]').nth(1).fill("60");
    await page.locator("textarea").nth(1).fill("Playwright overtime coverage");
    await page.getByRole("button", { name: /Save exception/i }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Capacity exception saved|updated/i);
  });

  test("command centre sidepanel shows capacity pressure when assigning work", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/command-centre-v2");
    await page.getByTestId(`ccv2-open-${fixtureRefs.commandCentreJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    const sidepanel = page.getByTestId("ccv2-sidepanel");
    await expect(sidepanel).toBeVisible();
    await expect(sidepanel).toContainText(/Capacity pressure/i);
    await expect(sidepanel).toContainText(/remaining|score/i);
  });
});
