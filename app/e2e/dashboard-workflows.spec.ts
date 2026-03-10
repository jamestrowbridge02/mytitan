import { expect, test, type Page } from "@playwright/test";
import { authFile, hasDashboardAuth } from "./utils";

test.use({ storageState: authFile });

async function expectRowsOrEmpty(page: Page, emptyText: RegExp | string) {
  const rows = page.locator(".operator-table__row");
  const rowCount = await rows.count();
  if (rowCount > 0) {
    await expect(rows.first()).toBeVisible();
    return rows.first();
  }

  await expect(page.getByText(emptyText)).toBeVisible();
  return null;
}

test.describe("dashboard workflows", () => {
  test.skip(!hasDashboardAuth(), "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run authenticated dashboard workflows.");

  test("bookings page exposes conversion workflow affordances", async ({ page }) => {
    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: /bookings/i })).toBeVisible();

    const firstRow = await expectRowsOrEmpty(page, /No bookings match this view/i);
    if (!firstRow) return;

    await expect(firstRow.getByRole("button", { name: /schedule/i })).toBeVisible();
    await firstRow.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByRole("menu", { name: /row actions/i })).toBeVisible();
    const hasConvert = await page.getByRole("menuitem", { name: /convert to job/i }).count();
    if (hasConvert) {
      await expect(page.getByRole("menuitem", { name: /convert to job/i }).first()).toBeVisible();
    }
  });

  test("billing readiness page exposes lifecycle controls", async ({ page }) => {
    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: /billing readiness/i })).toBeVisible();

    const firstRow = await expectRowsOrEmpty(page, /No completed work yet/i);
    if (!firstRow) return;

    await expect(firstRow.locator(".operator-table__cell--actions").locator("button, a").first()).toBeVisible();
    await expect(firstRow.getByText(/Lifecycle|Payment due|Payment overdue|Invoice artifact/i)).toBeVisible();
  });

  test("portal ops page exposes lifecycle state and actions", async ({ page }) => {
    await page.goto("/dashboard/portal");
    await expect(page.getByRole("heading", { name: /portal ops/i })).toBeVisible();

    const firstRow = await expectRowsOrEmpty(page, /No portal-manageable jobs yet/i);
    if (!firstRow) return;

    await expect(firstRow.locator(".operator-table__cell--actions").locator("button, a").first()).toBeVisible();
    await expect(firstRow.getByText(/Link active|Link expired|No active link/i)).toBeVisible();
  });

  test("technician page exposes queue actions and checklist context", async ({ page }) => {
    await page.goto("/dashboard/technician");
    await expect(page.getByRole("heading", { name: /technician queue/i })).toBeVisible();

    const firstRow = await expectRowsOrEmpty(page, /No assigned jobs/i);
    if (!firstRow) return;

    await expect(firstRow.locator('button[data-testid^="technician-"]')).toBeVisible();
    await expect(firstRow.locator('input[data-testid^="technician-note-input-"]')).toBeVisible();
    await expect(firstRow.getByText(/Workflow|Next:/i)).toBeVisible();
  });

  test("command centre v2 refresh exposes busy feedback", async ({ page }) => {
    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByRole("heading", { name: /command centre/i })).toBeVisible();
    await expect(page.getByTestId("ccv2-search-input")).toBeVisible();

    await page.route(/\/jobs\/board-v2(\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    }, { times: 1 });

    const refreshButton = page.getByTestId("ccv2-refresh-button");
    await refreshButton.click();
    await expect(refreshButton).toBeDisabled();
    await expect(refreshButton).toHaveText(/Refreshing/i);
    await expect(refreshButton).toHaveText(/^Refresh$/);
  });

  test("intelligence page loads its attention queue", async ({ page }) => {
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("heading", { name: /intelligence/i })).toBeVisible();
    await expect(page.getByText(/needs attention|attention/i).first()).toBeVisible();
  });
});
