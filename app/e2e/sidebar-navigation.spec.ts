import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.use({ storageState: authFile });

function rgbChannels(value: string) {
  return (value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
}

function luminance([r, g, b]: number[]) {
  return [r, g, b]
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground: number[], background: number[]) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectComputedContrast(locator: import("@playwright/test").Locator, minimum = 4.5, surface?: import("@playwright/test").Locator) {
  const styles = surface
    ? {
        color: await locator.evaluate((element) => window.getComputedStyle(element).color),
        backgroundColor: await surface.evaluate((element) => window.getComputedStyle(element).backgroundColor),
      }
    : await locator.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    let parent: Element | null = element;
    let backgroundColor = "";
    while (parent) {
      const candidate = window.getComputedStyle(parent).backgroundColor;
      if (candidate && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(candidate)) {
        backgroundColor = candidate;
        break;
      }
      parent = parent.parentElement;
    }
    return { color: computed.color, backgroundColor: backgroundColor || window.getComputedStyle(document.body).backgroundColor };
  });
  const ratio = contrastRatio(rgbChannels(styles.color), rgbChannels(styles.backgroundColor));
  expect(ratio, `foreground=${styles.color} background=${styles.backgroundColor}`).toBeGreaterThanOrEqual(minimum);
}

async function mockTenantSettings(page: import("@playwright/test").Page, overrides: Record<string, unknown>) {
  await page.route("**/api/tenant/settings", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyName: "Wheel A&R",
        tradingName: "Wheel A&R",
        registeredBusinessName: "Wheel A&R Limited",
        logoUrl: null,
        featureBookings: true,
        featureCustomerPortal: true,
        featurePayments: true,
        featureAccounting: true,
        ...overrides,
      }),
    });
  });
}

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

  test("tenant sidebar uses business-first identity in collapsed, expanded, fallback, and mobile states", async ({ page, request }) => {
    await mockTenantSettings(page, {
      companyName: "Wheel A&R",
      logoUrl: "/brand/mytitan-mark.svg",
    });
    await installApiProxy(page, request);
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("desktop-sidebar");
    const identity = page.getByTestId("sidebar-business-identity").first();
    await expect(identity).toHaveAccessibleName("Wheel A&R — powered by MyTitan");
    await expect(identity).toHaveAttribute("title", "Wheel A&R — powered by MyTitan");
    await expect(identity.getByTestId("sidebar-business-logo")).toBeVisible();
    const collapsedCopy = identity.locator(".mt-sidebar__brandCopy");
    await expect
      .poll(async () =>
        collapsedCopy.evaluate((node) => {
          const element = node as HTMLElement;
          const style = window.getComputedStyle(element);
          return {
            opacity: Number(style.opacity),
            width: Math.round(element.getBoundingClientRect().width),
          };
        }),
      )
      .toEqual({ opacity: 0, width: 0 });

    await sidebar.hover();
    await expect
      .poll(async () => collapsedCopy.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width)))
      .toBeGreaterThan(20);
    await expect(identity).toContainText("MyTitan");
    await expect(identity.getByTestId("sidebar-business-name")).toContainText("Wheel A&R");
    await expect(page.getByTestId("sidebar-logout")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 760 });
    await page.getByLabel("Open navigation").click();
    const mobile = page.getByTestId("mobile-sidebar");
    const mobileIdentity = mobile.getByTestId("sidebar-business-identity");
    await expect(mobileIdentity).toContainText("MyTitan");
    await expect(mobileIdentity.getByTestId("sidebar-business-name")).toContainText("Wheel A&R");
    await expect(mobileIdentity.getByTestId("sidebar-business-logo")).toBeVisible();
  });

  test("tenant sidebar falls back to initials or profile icon without leaking a broken logo", async ({ page, request }) => {
    await mockTenantSettings(page, {
      companyName: "North Star Services",
      logoUrl: "",
    });
    await installApiProxy(page, request);
    await page.goto("/dashboard");

    const identity = page.getByTestId("sidebar-business-identity").first();
    await expect(identity.getByTestId("sidebar-business-initials")).toHaveText("NS");
    await expect(identity.getByTestId("sidebar-business-logo")).toHaveCount(0);
    await expect(identity.getByTestId("sidebar-business-profile-fallback")).toHaveCount(0);

    await page.unroute("**/api/tenant/settings");
    await mockTenantSettings(page, {
      companyName: "",
      tradingName: "",
      registeredBusinessName: "",
      logoUrl: "",
    });
    await page.reload();
    await expect(page.getByTestId("sidebar-business-identity").first().getByTestId("sidebar-business-profile-fallback")).toBeVisible();
  });

  test("tenant sidebar recovers safely from a broken business logo", async ({ page, request }) => {
    await mockTenantSettings(page, {
      companyName: "Broken Logo Co",
      logoUrl: "/tenant/public-logo/missing-business-logo.png",
    });
    await page.route("**/tenant/public-logo/missing-business-logo.png", async (route) => {
      await route.fulfill({ status: 404, body: "" });
    });
    await installApiProxy(page, request);
    await page.goto("/dashboard");

    const identity = page.getByTestId("sidebar-business-identity").first();
    await expect(identity.getByTestId("sidebar-business-logo")).toHaveCount(0, { timeout: 5000 });
    await expect(identity.getByTestId("sidebar-business-initials")).toHaveText("BL");
  });

  test("platform admin keeps MyTitan platform branding separate from tenant support context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform");

    await expect(page.getByRole("heading", { name: "MyTitan Platform Admin" })).toBeVisible();
    await expect(page.getByTestId("desktop-sidebar")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Support Mode/i })).toBeVisible();
    await expect(page.getByTestId("platform-tenant-search-input")).toBeVisible();
    await page.getByTestId("platform-tenant-search-input").fill("E2E MyTitan Workspace");
    await expect(page.getByRole("heading", { name: /__E2E MyTitan Workspace|E2E MyTitan Workspace/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MyTitan Platform Admin" })).toBeVisible();
  });

  test("tenant sidebar identity remains readable in dark theme", async ({ page, request }) => {
    await mockTenantSettings(page, {
      companyName: "Wheel A&R",
      logoUrl: "/tenant/public-logo/logo-dark-theme-test.png",
    });
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const sidebar = page.getByTestId("desktop-sidebar");
    await sidebar.hover();
    await expect(sidebar).toHaveAttribute("data-sidebar-mode", "TEMPORARY_HOVER");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.dataset.theme = "dark";
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const identity = page.getByTestId("sidebar-business-identity").first();
    const identitySurface = page.getByTestId("sidebar-brand");
    await expectComputedContrast(identity.locator(".mt-sidebar__productName"), 4.5, identitySurface);
    await expectComputedContrast(identity.locator(".mt-sidebar__businessName"), 4.5, identitySurface);
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
