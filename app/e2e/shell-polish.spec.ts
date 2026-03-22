import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

test.describe("shell polish regressions", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("desktop shell keeps main content and sidebar scrolling independently", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Workspace settings" })).toBeVisible();

    const shellState = await page.evaluate(() => {
      const sidebar = document.querySelector(".mt-sidebar") as HTMLElement | null;
      const nav = document.querySelector(".mt-sidebar__nav") as HTMLElement | null;
      const main = document.querySelector(".mt-shell__main") as HTMLElement | null;
      const firstStack = (document.querySelector(".settings-premium-shell") || document.querySelector(".operator-stack")) as HTMLElement | null;
      const firstItem = document.querySelector(".mt-sidebar__item") as HTMLElement | null;
      const firstIcon = document.querySelector(".mt-sidebar__icon") as HTMLElement | null;

      if (!sidebar || !nav || !main || !firstStack || !firstItem || !firstIcon) {
        return null;
      }

      const initialTop = firstStack.getBoundingClientRect().top - main.getBoundingClientRect().top;
      const mainOverflowY = window.getComputedStyle(main).overflowY;
      const windowScrollBefore = window.scrollY;
      nav.scrollTop = 96;
      const navAfterOwnScroll = nav.scrollTop;
      main.scrollTop = 260;

      return {
        initialTop,
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        itemWidth: Math.round(firstItem.getBoundingClientRect().width),
        iconWidth: Math.round(firstIcon.getBoundingClientRect().width),
        mainOverflowY,
        navScrollable: nav.scrollHeight > nav.clientHeight,
        navScrollTop: nav.scrollTop,
        navAfterOwnScroll,
        mainScrollTop: main.scrollTop,
        windowScrollBefore,
        windowScrollAfter: window.scrollY,
      };
    });

    expect(shellState).toBeTruthy();
    expect(shellState?.initialTop ?? 999).toBeLessThan(72);
    expect(shellState?.sidebarWidth ?? 0).toBeLessThanOrEqual(82);
    expect(shellState?.itemWidth ?? 0).toBeLessThanOrEqual(48);
    expect(shellState?.iconWidth ?? 0).toBeGreaterThanOrEqual(38);
    expect(shellState?.mainOverflowY).toBe("auto");
    expect(shellState?.navScrollable).toBeTruthy();
    expect(shellState?.navAfterOwnScroll ?? 0).toBeGreaterThanOrEqual(90);
    expect(shellState?.navScrollTop ?? 0).toBeGreaterThanOrEqual(90);
    expect(shellState?.windowScrollBefore ?? 999).toBe(0);
    expect(shellState?.windowScrollAfter ?? 999).toBe(0);
  });

  test("calendar route shows plain-English fallback copy when the planning API is unavailable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.route("http://127.0.0.1:3000/calendar/bookings**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ message: "Scheduling calendar is not available in this environment." }),
      });
    });

    await page.goto("/dashboard/calendar");
    await expect(page.getByText("Calendar is not ready in this workspace")).toBeVisible();
    await expect(page.getByText("The planning calendar is unavailable right now.")).toBeVisible();
    await expect(page.getByText("Scheduling calendar is not available in this environment.")).toHaveCount(0);
    await expect(page.getByText(/Support code:/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open bookings" })).toBeVisible();
  });
});
