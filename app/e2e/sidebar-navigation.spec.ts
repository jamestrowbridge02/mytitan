import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("sidebar navigation cleanup", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("sidebar shows only the real nav structure and command palette stays in the overlay", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const sidebar = page.getByRole("complementary");
    const dashboardLink = sidebar.getByRole("link", { name: "Dashboard", exact: true });
    await expect(dashboardLink).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Command Centre" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Compliance" })).toBeVisible();
    await expect(sidebar.getByText("Today at a glance")).toBeHidden();
    await dashboardLink.hover();
    await expect(sidebar.getByText("Today at a glance")).toBeVisible();

    await expect(page.getByText("Search routes")).toHaveCount(0);
    await expect(page.getByText("Ctrl K opens global command search.")).toHaveCount(0);
    await expect(page.locator("input[placeholder='Search routes']")).toHaveCount(0);

    await page.keyboard.press("Control+K");
    await expect(page.locator("input[placeholder='Search routes and jump']")).toBeVisible();
  });
});
