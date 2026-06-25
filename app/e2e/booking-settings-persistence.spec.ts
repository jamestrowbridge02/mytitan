import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("booking settings ownership", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("bookings dashboard hands configuration off to Settings instead of duplicating controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });

    const handoff = page.getByTestId("bookings-settings-handoff");
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText("Manage in Settings");
    await expect(handoff.getByRole("link", { name: "Manage in Settings" })).toBeVisible();
    await expect(handoff.getByRole("button", { name: "Save booking settings" })).toHaveCount(0);
    await expect(handoff.locator('input[type="time"]')).toHaveCount(0);
    await expect(handoff.locator('input[type="checkbox"]')).toHaveCount(0);
  });

  test("tenant settings do not expose raw public booking or ICS tokens", async ({ request }) => {
    const login = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
    });
    expect(login.ok()).toBeTruthy();

    const auth = await login.json();
    const response = await requestLocalApi(request, "/tenant/settings", {
      headers: { Authorization: `Bearer ${String(auth?.token || "")}` },
    });

    expect(response.ok()).toBeTruthy();
    const settings = await response.json();
    expect(settings).not.toHaveProperty("bookingPublicToken");
    expect(settings).not.toHaveProperty("bookingIcsToken");
  });
});
