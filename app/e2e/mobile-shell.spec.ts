import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile, viewport: { width: 390, height: 844 } });

async function getToken(page: import("@playwright/test").Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

test.describe("mobile shell usability", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("mobile nav opens and closes without trapping page interaction", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs", { waitUntil: "domcontentloaded" });

    const navToggle = page.getByTestId("mobile-nav-toggle");
    const mobileNav = page.locator("#mt-mobile-nav");
    const jobsSearch = page.getByLabel("Search job ref, customer, reg, service, or owner");
    const resetFilters = page.getByRole("button", { name: "Reset filters" });

    await expect(navToggle).toBeVisible();
    await expect(jobsSearch).toBeVisible();

    await jobsSearch.fill("unassigned");
    await expect(jobsSearch).toHaveValue("unassigned");

    await navToggle.click();
    await expect(mobileNav).toBeVisible();
    await expect(page.getByTestId("mobile-nav-backdrop")).toBeVisible();

    await page.getByTestId("mobile-nav-backdrop").click();
    await expect(mobileNav).not.toBeVisible();
    await expect(page.getByTestId("mobile-nav-backdrop")).toHaveCount(0);

    await resetFilters.click();
    await expect(jobsSearch).toHaveValue("");

    await navToggle.click();
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByTestId("sidebar-global-search")).toBeVisible();
    await mobileNav.getByTestId("sidebar-global-search").click();
    await expect(mobileNav).not.toBeVisible();
    await expect(page.getByTestId("command-palette-search")).toBeVisible();
    await page.keyboard.press("Escape");

    await navToggle.click();
    await expect(mobileNav).toBeVisible();
    await mobileNav.getByRole("button", { name: "Close navigation" }).click();
    await expect(mobileNav).not.toBeVisible();

    await jobsSearch.fill("assigned");
    await expect(jobsSearch).toHaveValue("assigned");
    await expect(navToggle).toBeVisible();
  });

  test("core dashboard routes stay within the mobile viewport", async ({ page, request }) => {
    await installApiProxy(page, request);

    const routes = [
      { path: "/dashboard", assertion: () => page.getByTestId("dashboard-start-work") },
      { path: "/dashboard/work", assertion: () => page.getByText("Needs payment follow-up").first() },
      { path: "/dashboard/jobs", assertion: () => page.getByLabel("Search job ref, customer, reg, service, or owner") },
      { path: "/dashboard/jobs/e2e-job-portal-active", assertion: () => page.getByTestId("job-customer-handoff-card") },
      { path: "/dashboard/customers", assertion: () => page.getByLabel("Search customer, phone, or email") },
      { path: "/dashboard/bookings", assertion: () => page.getByPlaceholder("Search customer, booking id, job id, or status") },
      { path: "/dashboard/billing", assertion: () => page.getByRole("heading", { name: /mytitan account/i }) },
      { path: "/dashboard/jobs/new?guided=1&entry=work", assertion: () => page.getByTestId("jobs-guided-nav-bottom") },
      { path: "/dashboard/settings?tab=general", assertion: () => page.locator("h1", { hasText: /^Settings$/ }) },
    ];

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(route.assertion()).toBeVisible();
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const tolerance = 20;
              const doc = document.documentElement;
              const viewportWidth = Math.max(
                window.innerWidth,
                doc.clientWidth,
                Math.round(window.visualViewport?.width ?? 0),
              );
              const main = document.querySelector(".mt-shell__main") as HTMLElement | null;
              const scope = main ?? document.body;
              const offenders = Array.from(scope.querySelectorAll<HTMLElement>("*"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  const style = window.getComputedStyle(element);
                  return {
                    text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
                    className: typeof element.className === "string" ? element.className : "",
                    right: Math.round(rect.right),
                    left: Math.round(rect.left),
                    width: Math.round(rect.width),
                    display: style.display,
                    visibility: style.visibility,
                    position: style.position,
                    whiteSpace: style.whiteSpace,
                  };
                })
                .filter((entry) => {
                  if (entry.display === "none" || entry.visibility === "hidden") return false;
                  if (entry.width <= 0) return false;
                  return entry.left < -tolerance || entry.right > viewportWidth + tolerance;
                })
                .slice(0, 5);
              const mainRect = main?.getBoundingClientRect();
              const mainFitsViewport = !mainRect || (mainRect.left >= -tolerance && mainRect.right <= viewportWidth + tolerance);
              const documentFitsViewport = doc.clientWidth <= viewportWidth + tolerance;
              const visibleElementsFitViewport = offenders.length === 0;
              return documentFitsViewport && mainFitsViewport && visibleElementsFitViewport
                ? "ok"
                : JSON.stringify({
                    documentFitsViewport,
                    mainFitsViewport,
                    visibleElementsFitViewport,
                    offenders,
                  });
            }),
          {
            timeout: 2_000,
            intervals: [100, 250, 500],
            message: `Viewport fit did not settle on ${route.path}`,
          },
        )
        .toBe("ok");
    }
  });

  test("live work summary stays readable and inside the mobile viewport", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ccv2-status-summary")).toBeVisible();
    await expect(page.getByTestId("ccv2-recent-updates")).toBeVisible();
    await expect(page.getByTestId("ccv2-recent-updates-title")).toBeVisible();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const viewportWidth = window.innerWidth;
            const summary = document.querySelector('[data-testid="ccv2-status-summary"]') as HTMLElement | null;
            const activity = document.querySelector('[data-testid="ccv2-recent-updates"]') as HTMLElement | null;
            if (!summary || !activity) return "missing";

            const summaryRect = summary.getBoundingClientRect();
            const activityRect = activity.getBoundingClientRect();
            const overflowX = document.documentElement.scrollWidth - viewportWidth;

            return summaryRect.right <= viewportWidth + 12 &&
              activityRect.right <= viewportWidth + 12 &&
              summaryRect.left >= -12 &&
              activityRect.left >= -12 &&
              overflowX <= 12
              ? "ok"
              : JSON.stringify({
                  summary: {
                    left: Math.round(summaryRect.left),
                    right: Math.round(summaryRect.right),
                    width: Math.round(summaryRect.width),
                  },
                  activity: {
                    left: Math.round(activityRect.left),
                    right: Math.round(activityRect.right),
                    width: Math.round(activityRect.width),
                  },
                  overflowX,
                });
          }),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe("ok");
  });

  test("notification drawer stays inside the mobile viewport", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const createResponse = await requestLocalApi(request, "/notifications/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "booking",
        entityId: "e2e-booking-convertible",
        templateKey: "booking.requested",
        note: "Public booking request received",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-notification-bell")).toBeVisible();
    await page.getByTestId("dashboard-notification-bell").click();
    await expect(page.getByTestId("dashboard-notification-drawer")).toBeVisible();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const drawer = document.querySelector('[data-testid="dashboard-notification-drawer"]') as HTMLElement | null;
            if (!drawer) return "missing";
            const rect = drawer.getBoundingClientRect();
            const overflowX = document.documentElement.scrollWidth - window.innerWidth;
            return rect.left >= 0 && rect.right <= window.innerWidth + 6 && overflowX <= 6
              ? "ok"
              : JSON.stringify({
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  overflowX,
                });
          }),
        { timeout: 10_000, intervals: [100, 250, 500] },
      )
      .toBe("ok");
  });
});
