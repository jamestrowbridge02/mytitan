import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("sidebar navigation cleanup", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("sidebar shows only the real nav structure and command palette stays in the overlay", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const sidebar = page.getByRole("complementary");
    const groupTitles = sidebar.locator(".mt-sidebar__groupTitle");

    await expect(sidebar).toContainText("Dashboard");
    await expect(sidebar).toContainText("Command Centre");
    await expect(sidebar).toContainText("Analytics");
    await expect(sidebar).toContainText("Compliance");
    await expect(sidebar).toContainText("Operations");
    await expect(sidebar).toContainText("Commercial");
    await expect(sidebar).toContainText("Platform");

    await expect(page.getByText("Search routes")).toHaveCount(0);
    await expect(page.getByText("Ctrl K opens global command search.")).toHaveCount(0);
    await expect(groupTitles.filter({ hasText: /^Overview$/ })).toHaveCount(0);
    await expect(groupTitles.filter({ hasText: /^Work$/ })).toHaveCount(0);
    await expect(groupTitles.filter({ hasText: /^Money$/ })).toHaveCount(0);
    await expect(groupTitles.filter({ hasText: /^Settings$/ })).toHaveCount(0);
    await expect(page.locator("input[placeholder='Search routes']")).toHaveCount(0);

    await page.keyboard.press("Control+K");
    await expect(page.locator("input[placeholder='Search routes and jump']")).toBeVisible();
  });
});
