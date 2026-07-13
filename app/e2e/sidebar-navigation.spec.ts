import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.use({ storageState: authFile });

test.describe("sidebar navigation cleanup", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("sidebar shows only the real nav structure and command palette stays in the overlay", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    await page.mouse.move(600, 200);
    const sidebar = page.getByRole("complementary");
    const dashboardLink = sidebar.getByRole("link", { name: "Dashboard", exact: true });
    const bookingsLink = sidebar.locator('a[href="/dashboard/bookings"]');
    const collapsedWidth = await sidebar.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
    await expect(dashboardLink).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Work", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Calendar" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Customer Portal" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Finance/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Communications" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Team" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Tools" })).toBeVisible();
    await expect(bookingsLink).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Enterprise" })).toHaveCount(0);
    await expect(sidebar.locator('a[href="/dashboard/jobs"]')).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Live Work" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Payments", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Revenue" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Billing" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "General" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Job Output" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Messages" })).toHaveCount(0);
    await expect(sidebar.getByText("Today at a glance")).toHaveCount(0);
    await sidebar.hover();
    await expect(sidebar.getByText("Operations")).toBeVisible();
    await expect(sidebar.locator(".mt-sidebar__groupTitle", { hasText: "Finance" })).toBeVisible();
    await expect(sidebar.getByText("Customer Portal")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Communications" })).toBeVisible();
    await expect(sidebar.getByText("Team")).toBeVisible();
    await expect(sidebar.getByText("Calendar")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Finance/ })).toBeVisible();
    await expect(sidebar.getByText("Tools")).toBeVisible();
    await expect(sidebar.getByText(/Bookings|Requests/)).toBeVisible();
    await expect(sidebar.getByText("Today at a glance")).toHaveCount(0);
    await expect(sidebar.getByText("Run the active work board and clear blockers")).toHaveCount(0);
    await expect(sidebar.getByText("Keep your plan, payments, and workspace continuity in shape")).toHaveCount(0);
    await expect(sidebar.getByText("Connect the tools you already use")).toHaveCount(0);
    const expandedWidth = await sidebar.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
    expect(expandedWidth).toBeGreaterThan(collapsedWidth);
    expect(expandedWidth).toBeLessThanOrEqual(220);
    await page.mouse.move(520, 240);
    await expect
      .poll(async () => sidebar.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width)), { timeout: 3000 })
      .toBeLessThanOrEqual(collapsedWidth + 4);
    await expect(sidebar).toHaveAttribute("data-sidebar-mode", "PINNED");
    await sidebar.hover();

    const sidebarSearch = page.getByTestId("sidebar-global-search");
    await expect(sidebarSearch).toBeVisible();
    await expect(sidebarSearch).toHaveAccessibleName("Search workspace routes");
    await expect(sidebarSearch).toContainText("Search...");
    await expect(sidebarSearch).not.toContainText(/Ctrl|Cmd|⌘/i);
    await sidebarSearch.click();
    await expect(page.getByTestId("command-palette-search")).toBeVisible();
    await page.getByTestId("command-palette-search").fill("connected tools");
    await expect(page.getByTestId("command-palette-item-integrations")).toContainText("Connect accounting, payments, calendar, and messaging.");
    await page.getByTestId("command-palette-item-integrations").click();
    await expect(page).toHaveURL(/\/dashboard\/integrations$/);
    await expect(page.getByTestId("command-palette")).toHaveCount(0);

    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette-search")).toBeVisible();
    await expect(page.getByLabel("Search workspace commands")).toHaveAttribute("placeholder", /Search customers, jobs, invoices/);
  });

  test("route search is role-safe and hides platform-only destinations from tenant users", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    await page.getByRole("complementary").hover();
    await page.getByTestId("sidebar-global-search").click();
    await page.getByTestId("command-palette-search").fill("platform");
    await expect(page.getByTestId("command-palette-item-platform-admin")).toHaveCount(0);
    await expect(page.getByTestId("command-palette-item-developer-admin")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    await page.goto("/dashboard/technician");
    await page.getByRole("complementary").hover();
    await page.getByTestId("sidebar-global-search").click();
    await page.getByTestId("command-palette-search").fill("settings");
    await expect(page.getByTestId("command-palette-item-settings")).toHaveCount(0);
    await expect(page.getByTestId("command-palette-item-team")).toHaveCount(0);
  });

  test("platform admins can find the separate platform surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/dashboard");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByTestId("command-palette-search").fill("platform admin");
    await expect(page.getByTestId("command-palette-item-platform-admin")).toBeVisible();
    await page.getByTestId("command-palette-item-platform-admin").click();
    await expect(page).toHaveURL(/\/platform$/);
  });

  test("sidebar highlights only the current route", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/finance");
    await page.mouse.move(600, 200);

    const sidebar = page.getByRole("complementary");
    const dashboardLink = sidebar.getByRole("link", { name: "Dashboard", exact: true });
    const financeLink = sidebar.getByRole("link", { name: /Finance/ });

    await expect(financeLink).toHaveAttribute("aria-current", "page");
    await expect(dashboardLink).not.toHaveAttribute("aria-current", "page");
    await sidebar.hover();
    await expect(sidebar.getByRole("link", { name: /Finance/ })).toBeVisible();
    await expect(sidebar.getByText("Run repeat work on time")).toHaveCount(0);
    await expect(financeLink).toHaveAttribute("aria-current", "page");

    await page.goto("/dashboard");
    await expect(dashboardLink).toHaveAttribute("aria-current", "page");
    await expect(financeLink).not.toHaveAttribute("aria-current", "page");
  });

  test("primary sidebar icons are distinct and settings uses a cog", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const sidebar = page.getByRole("complementary");
    const hrefs = [
      "/dashboard/work",
      "/dashboard/calendar",
      "/dashboard/bookings",
      "/dashboard/customers",
      "/dashboard/finance",
      "/dashboard/assets",
      "/dashboard/integrations",
      "/dashboard/analytics",
      "/dashboard/users",
      "/dashboard/settings",
    ];
    const iconGeometry = await Promise.all(
      hrefs.map(async (href) => sidebar.locator(`a[href="${href}"] svg`).evaluate((node) => node.innerHTML)),
    );
    expect(new Set(iconGeometry).size).toBe(iconGeometry.length);

    const settingsIcon = sidebar.locator('a[href="/dashboard/settings"] svg');
    await expect(settingsIcon.locator("circle")).toHaveCount(1);
    await expect(settingsIcon.locator("path")).toHaveCount(1);
  });

  test("legacy settings integrations route redirects into the real integrations workspace", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings/integrations");
    await expect(page).toHaveURL(/\/dashboard\/integrations$/);
    await expect(page.getByRole("heading", { name: "Connected tools", exact: true })).toBeVisible();
  });

  test("technician sidebar stays focused on live work", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    await page.goto("/dashboard/technician");

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Work", exact: true })).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/jobs"]')).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Customers|Vehicles/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Tools", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  });

  test("finance sidebar keeps the finance workspace primary", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.financeEmail, fixtureRefs.financePassword);
    await page.goto("/dashboard/finance");

    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /Finance/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Payments", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Revenue", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Billing", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: /Customers|Vehicles/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  });
});
