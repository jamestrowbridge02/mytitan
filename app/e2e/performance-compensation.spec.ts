import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.use({ storageState: authFile });

test.describe("team performance and compensation ops", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated performance tests.");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("mytitan_active_location_id_v1", "all");
    });
  });

  test("performance page renders scorecards, leaderboard, and risks", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/performance");
    await expect(page.getByTestId("performance-scorecard-list")).toContainText("e2e.technician@mytitan.local");
    await expect(page.getByTestId("performance-leaderboard")).toContainText("e2e.operator@mytitan.local");
    await expect(page.getByTestId("performance-risk-list")).toContainText(/e2e\.technician@mytitan\.local|e2e\.finance@mytitan\.local/i);
  });

  test("operator can create and edit a performance period", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/performance");
    const suffix = Date.now().toString().slice(-6);
    const name = `E2E period ${suffix}`;
    const updatedName = `${name} updated`;
    await page.getByPlaceholder("Period name").fill(name);
    await page.locator('input[type="date"]').nth(0).fill("2026-03-01");
    await page.locator('input[type="date"]').nth(1).fill("2026-03-31");
    await page.getByRole("button", { name: "Save period" }).evaluate((element: HTMLButtonElement) => element.click());
    const row = page.locator(".operator-table__row", { hasText: name }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).evaluate((element: HTMLButtonElement) => element.click());
    await page.getByPlaceholder("Period name").fill(updatedName);
    await page.getByRole("button", { name: "Save period" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.locator("body")).toContainText(updatedName);
  });

  test("compensation page renders seeded rules and draft runs", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compensation");
    await page.getByRole("combobox").first().selectOption({ label: fixtureRefs.performancePeriodName });
    await expect(page.getByTestId("compensation-rule-list")).toContainText(fixtureRefs.compensationRuleName);
    await expect(page.getByTestId("compensation-run-list")).toContainText("e2e.technician@mytitan.local");
    await expect(page.getByTestId("compensation-run-list")).toContainText("DRAFT");
  });

  test("operator can create and edit a compensation rule", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compensation");
    await page.getByRole("combobox").first().selectOption({ label: fixtureRefs.performancePeriodName });
    const suffix = Date.now().toString().slice(-6);
    const name = `E2E comp rule ${suffix}`;
    const updatedName = `${name} updated`;
    await page.getByPlaceholder("Rule name").fill(name);
    await page.getByRole("button", { name: "Save rule" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compensation-rule-list")).toContainText(name);
    const row = page.locator(".operator-table__row", { hasText: name }).first();
    await row.getByRole("button", { name: "Edit" }).evaluate((element: HTMLButtonElement) => element.click());
    await page.getByPlaceholder("Rule name").fill(updatedName);
    await page.getByRole("button", { name: "Save rule" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compensation-rule-list")).toContainText(updatedName);
  });

  test("preview refresh keeps compensation runs explainable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compensation");
    await page.getByRole("combobox").first().selectOption({ label: fixtureRefs.performancePeriodName });
    await page.getByTestId("compensation-preview").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compensation-run-list")).toContainText("Technician completion bonus");
  });

  test("operator can approve and cancel draft compensation runs", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compensation");
    await page.getByRole("combobox").first().selectOption({ label: fixtureRefs.performancePeriodName });
    const approveButton = page.getByTestId("compensation-approve").first();
    await approveButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compensation-run-list")).toContainText("APPROVED");

    await page.getByTestId("compensation-preview").evaluate((element: HTMLButtonElement) => element.click());
    const cancelButton = page.locator(".operator-table__row", { hasText: "DRAFT" }).first().getByRole("button", { name: "Cancel" });
    await cancelButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compensation-run-list")).toContainText("CANCELLED");
  });

  test("technician cannot access team compensation previews", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    await page.goto("/dashboard/compensation");
    await expect(page.getByText("Compensation access restricted")).toBeVisible();
  });
});
