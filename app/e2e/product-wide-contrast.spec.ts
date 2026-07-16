import { expect, test } from "@playwright/test";

import { expectReadable } from "./contrast-utils";
import { fixtureRefs, installApiProxy, loginAs } from "./utils";

const marketingBase = process.env.PLAYWRIGHT_MARKETING_BASE_URL || "http://127.0.0.1:3002";

async function forceTheme(page: any, mode: "light" | "dark") {
  const apply = (theme: "light" | "dark") => {
    window.localStorage.setItem("mytitan_theme_mode", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = theme;
  };
  await page.addInitScript(apply, mode);
  await page.evaluate(apply, mode).catch(() => undefined);
}

test.describe("product-wide computed contrast", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`Dashboard premium header and actions are readable in ${theme} theme`, async ({ page, request }) => {
      await installApiProxy(page, request);
      await forceTheme(page, theme);
      await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

      const response = await page.goto("/dashboard", { waitUntil: "networkidle" });
      expect(response?.status()).toBeLessThan(400);
      await forceTheme(page, theme);
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(1);

      await expectReadable(page.getByRole("heading", { name: "Dashboard", exact: true }), "Dashboard title", "/dashboard");
      await expectReadable(page.locator(".dashboard-premium-greeting"), "Dashboard greeting", "/dashboard");
      await expectReadable(page.locator(".dashboard-premium-meta"), "Dashboard business/date", "/dashboard");
      await expectReadable(page.getByRole("link", { name: "Open analytics" }), "Open analytics link", "/dashboard");
      await expectReadable(page.getByTestId("dashboard-primary-action"), "Dashboard primary action", "/dashboard");
      await expectReadable(page.getByText("Business snapshot"), "Business snapshot heading", "/dashboard");

      if (theme === "dark") {
        const darkBlueOnDark = await page.locator(".dashboard-premium-title, .dashboard-premium-greeting, .dashboard-premium-meta").evaluateAll((nodes) =>
          nodes.map((node) => {
            const color = window.getComputedStyle(node).color;
            return /rgb\((1[0-9]|2[0-9]|3[0-9]|4[0-9]),\s*(2[0-9]|3[0-9]|4[0-9]|5[0-9]),\s*(4[0-9]|5[0-9]|6[0-9]|7[0-9])\)/.test(color);
          }).some(Boolean)
        );
        expect(darkBlueOnDark).toBeFalsy();
      }
    });
  }

  test("marketing header, drawer, body links, footer, and legal routes are readable", async ({ page }) => {
    const routes = ["/", "/pricing", "/integrations", "/security", "/privacy", "/terms", "/cookies", "/accessibility"];
    for (const route of routes) {
      const response = await page.goto(`${marketingBase}${route}`, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} should load`).toBe(200);
      await expectReadable(page.getByRole("button", { name: "Open navigation menu" }), "marketing menu button", route);
      await expectReadable(page.getByRole("link", { name: "Start Setup / Sign In" }), "marketing sign in CTA", route);
      await expectReadable(page.locator(".mkt-siteFooter__links a").first(), "marketing footer link", route);
      await expectReadable(page.locator(".mkt-siteFooter__mail"), "marketing footer mail link", route);
      const firstBodyLink = page.locator(".mkt-page a, .mkt-page .mkt-inlineLink").first();
      if (await firstBodyLink.count()) {
        await expectReadable(firstBodyLink, "marketing body link", route);
      }
    }

    await page.goto(`${marketingBase}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expectReadable(page.locator("#mkt-navigation-drawer .mkt-drawer__link").first(), "marketing drawer link", "/");
    await expectReadable(page.locator("#mkt-navigation-drawer .mkt-drawer__footer a").first(), "marketing drawer footer link", "/");
  });

  test("shared component states retain computed contrast", async ({ page, request }) => {
    await installApiProxy(page, request);
    await forceTheme(page, "dark");
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });

    await expectReadable(page.getByRole("heading", { name: /Settings/i }).first(), "settings heading", "/dashboard/settings");
    await expectReadable(page.locator(".button").first(), "primary button", "/dashboard/settings");
    await expectReadable(page.locator(".button.secondary").first(), "secondary button", "/dashboard/settings");
    await expectReadable(page.locator("label").first(), "form label", "/dashboard/settings");
    await expectReadable(page.locator(".muted, .settings-premium-muted").first(), "muted text", "/dashboard/settings");
  });
});
