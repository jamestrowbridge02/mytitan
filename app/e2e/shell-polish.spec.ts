import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

test.describe("shell polish regressions", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("desktop shell keeps main content and sidebar scrolling independently", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto("/dashboard/finance");
    await page.mouse.move(600, 200);
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();

    const shellState = await page.evaluate(() => {
      const sidebar = document.querySelector(".mt-sidebar") as HTMLElement | null;
      const nav = document.querySelector(".mt-sidebar__nav") as HTMLElement | null;
      const navWrap = document.querySelector(".mt-sidebar__navWrap") as HTMLElement | null;
      const main = document.querySelector(".mt-shell__main") as HTMLElement | null;
      const brand = document.querySelector(".mt-sidebar__brand") as HTMLElement | null;
      const footer = document.querySelector(".mt-sidebar__footer") as HTMLElement | null;
      const firstStack = (document.querySelector(".settings-premium-shell") || document.querySelector(".operator-stack")) as HTMLElement | null;
      const firstItem = document.querySelector(".mt-sidebar__item") as HTMLElement | null;
      const firstIcon = document.querySelector(".mt-sidebar__icon") as HTMLElement | null;
      const lastItem = Array.from(document.querySelectorAll(".mt-sidebar__item")).at(-1) as HTMLElement | null;

      if (!sidebar || !nav || !navWrap || !main || !brand || !footer || !firstStack || !firstItem || !firstIcon || !lastItem) {
        return null;
      }

      const initialTop = firstStack.getBoundingClientRect().top - main.getBoundingClientRect().top;
      const mainOverflowY = window.getComputedStyle(main).overflowY;
      const navWrapOverflowY = window.getComputedStyle(navWrap).overflowY;
      const navOverflowY = window.getComputedStyle(nav).overflowY;
      const windowScrollBefore = window.scrollY;
      const navScrollable = nav.scrollHeight > nav.clientHeight;
      const navScrollBefore = nav.scrollTop;
      nav.scrollTo({ top: nav.scrollHeight, behavior: "instant" as ScrollBehavior });
      main.scrollTop = main.scrollHeight;
      const navRect = nav.getBoundingClientRect();
      const lastRect = lastItem.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const itemRect = firstItem.getBoundingClientRect();
      const iconRect = firstIcon.getBoundingClientRect();

      return {
        brandTop: Math.round(brand.getBoundingClientRect().top - sidebar.getBoundingClientRect().top),
        initialTop,
        navScrollable,
        navScrollBefore,
        navScrollAfter: nav.scrollTop,
        navWrapOverflowY,
        navOverflowY,
        lastItemBottomGap: Math.round(navRect.bottom - lastRect.bottom),
        lastItemClearsFooter: Math.round(footerRect.top - lastRect.bottom),
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        itemWidth: Math.round(itemRect.width),
        iconWidth: Math.round(iconRect.width),
        iconCenterOffset: Math.round(Math.abs((itemRect.left + itemRect.width / 2) - (iconRect.left + iconRect.width / 2))),
        mainOverflowY,
        mainScrollable: main.scrollHeight > main.clientHeight,
        mainScrollTop: main.scrollTop,
        windowScrollBefore,
        windowScrollAfter: window.scrollY,
      };
    });

    expect(shellState).toBeTruthy();
    expect(shellState?.brandTop ?? 999).toBeLessThan(24);
    expect(shellState?.initialTop ?? -1).toBeGreaterThanOrEqual(0);
    expect(shellState?.navScrollable || (shellState?.lastItemBottomGap ?? -999) >= 0).toBeTruthy();
    expect(shellState?.navScrollBefore ?? 999).toBe(0);
    expect(shellState?.navWrapOverflowY).toBe("hidden");
    expect(shellState?.navOverflowY).toBe("auto");
    if (shellState?.navScrollable) {
      expect(shellState?.navScrollAfter ?? 0).toBeGreaterThan(0);
    } else {
      expect(shellState?.navScrollAfter ?? 999).toBe(0);
    }
    expect(shellState?.lastItemBottomGap ?? -999).toBeGreaterThanOrEqual(0);
    expect(shellState?.lastItemClearsFooter ?? -999).toBeGreaterThanOrEqual(8);
    expect(shellState?.sidebarWidth ?? 0).toBeLessThanOrEqual(82);
    expect(shellState?.itemWidth ?? 999).toBeLessThanOrEqual((shellState?.sidebarWidth ?? 0) + 16);
    expect(shellState?.iconWidth ?? 0).toBeGreaterThanOrEqual(38);
    expect(shellState?.iconCenterOffset ?? 999).toBeLessThanOrEqual(2);
    expect(shellState?.mainScrollable).toBeTruthy();
    expect(shellState?.mainScrollTop ?? 0).toBeGreaterThan(0);
    expect(shellState?.windowScrollBefore ?? 999).toBe(0);
    expect(shellState?.windowScrollAfter ?? 999).toBe(0);
  });

  test("desktop sidebar expands on hover without shifting the main content", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/finance");
    await page.mouse.move(600, 200);
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();

    const shellBeforeHover = await page.evaluate(() => {
      const sidebar = document.querySelector(".mt-sidebar") as HTMLElement | null;
      const main = document.querySelector(".mt-shell__main") as HTMLElement | null;
      if (!sidebar || !main) return null;
      return {
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        mainLeft: Math.round(main.getBoundingClientRect().left),
      };
    });

    expect(shellBeforeHover).toBeTruthy();
    const sidebar = page.getByRole("complementary");
    await sidebar.hover();
    await expect(sidebar.getByRole("link", { name: /Finance/ })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Plans", exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("Run repeat work on time")).toHaveCount(0);
    const activeLink = sidebar.getByRole("link", { name: /Finance/ });
    await activeLink.focus();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const item = document.querySelector('.mt-sidebar__item[aria-current="page"]') as HTMLElement | null;
          const icon = item?.querySelector(".mt-sidebar__icon") as HTMLElement | null;
          const label = item?.querySelector(".mt-sidebar__label") as HTMLElement | null;
          if (!item || !icon || !label) return null;
          const itemRect = item.getBoundingClientRect();
          const iconRect = icon.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          return {
            labelVisible: Number.parseFloat(window.getComputedStyle(label).opacity || "0") >= 0.99,
            labelBesideIcon: Math.round(labelRect.left + labelRect.width / 2) > Math.round(iconRect.left + iconRect.width / 2),
            labelWithinItem: Math.round(labelRect.bottom) <= Math.round(itemRect.bottom) && Math.round(labelRect.top) >= Math.round(itemRect.top),
          };
        });
      })
      .toMatchObject({
        labelVisible: true,
        labelBesideIcon: true,
        labelWithinItem: true,
      });

    const labelLayout = await page.evaluate(() => {
      const item = document.querySelector('.mt-sidebar__item[aria-current="page"]') as HTMLElement | null;
      const icon = item?.querySelector(".mt-sidebar__icon") as HTMLElement | null;
      const label = item?.querySelector(".mt-sidebar__label") as HTMLElement | null;
      if (!item || !icon || !label) return null;
      const itemRect = item.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        labelVisible: Number.parseFloat(window.getComputedStyle(label).opacity || "0") >= 0.99,
        labelBesideIcon: Math.round(labelRect.left + labelRect.width / 2) > Math.round(iconRect.left + iconRect.width / 2),
        labelWithinItem: Math.round(labelRect.bottom) <= Math.round(itemRect.bottom) && Math.round(labelRect.top) >= Math.round(itemRect.top),
      };
    });

    const shellAfterHover = await page.evaluate(() => {
      const sidebar = document.querySelector(".mt-sidebar") as HTMLElement | null;
      const main = document.querySelector(".mt-shell__main") as HTMLElement | null;
      if (!sidebar || !main) return null;
      const sidebarRect = sidebar.getBoundingClientRect();
      const overlapTarget = document.elementFromPoint(sidebarRect.right - 12, Math.round(sidebarRect.top + 120)) as HTMLElement | null;
      const computed = window.getComputedStyle(sidebar);
      return {
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        mainLeft: Math.round(main.getBoundingClientRect().left),
        sidebarZIndex: computed.zIndex,
        sidebarBackgroundColor: computed.backgroundColor,
        overlapInsideSidebar: Boolean(overlapTarget?.closest(".mt-sidebar")),
      };
    });

    expect(shellAfterHover).toBeTruthy();
    expect(labelLayout).toBeTruthy();
    expect(labelLayout?.labelVisible).toBeTruthy();
    expect(labelLayout?.labelBesideIcon).toBeTruthy();
    expect(labelLayout?.labelWithinItem).toBeTruthy();
    expect(shellAfterHover?.sidebarWidth ?? 0).toBeGreaterThan(160);
    expect(shellAfterHover?.sidebarWidth ?? 999).toBeLessThanOrEqual(220);
    expect(shellAfterHover?.mainLeft ?? -1).toBe(shellBeforeHover?.mainLeft ?? -2);
    expect(Number(shellAfterHover?.sidebarZIndex ?? 0)).toBeGreaterThanOrEqual(40);
    expect(shellAfterHover?.sidebarBackgroundColor).toBe("rgba(244, 247, 252, 0.92)");
    expect(shellAfterHover?.overlapInsideSidebar).toBeTruthy();
  });

  test("header quick options expand and collapse without blocking keyboard use", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/work");

    const toggle = page.locator('button[aria-controls="dashboard-quick-options"]');
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#dashboard-quick-options")).toHaveCount(0);

    await toggle.click();
    await expect(page.locator("#dashboard-quick-options")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.mouse.move(10, 10);
    await expect(page.locator("#dashboard-quick-options")).toHaveCount(0);

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#dashboard-quick-options")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#dashboard-quick-options")).toHaveCount(0);

    await toggle.click();
    await page.mouse.click(10, 10);
    await expect(page.locator("#dashboard-quick-options")).toHaveCount(0);
  });

  test("calendar route shows plain-English fallback copy when the planning API is unavailable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.route("**/calendar/bookings**", async (route) => {
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
    await expect(page.getByRole("link", { name: /open bookings|review bookings/i })).toBeVisible();
  });
});
