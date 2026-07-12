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
    await expect(handoff).toContainText("Public booking");
    await expect(handoff.getByRole("link", { name: "Manage" })).toBeVisible();
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

  test("booking settings use one Bookings label with preview, basis, and eye visibility controls", async ({ page, request }) => {
    const login = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
    });
    expect(login.ok()).toBeTruthy();
    const auth = await login.json();
    await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(auth?.token || "")}`,
        "Content-Type": "application/json",
      },
      data: {
        publicEnabled: true,
        bookingMode: "LOCATION",
        businessHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        })),
      },
    });

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/booking/settings", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Bookings" }).first()).toBeVisible();
    await expect(page.getByTestId("booking-setup-progress")).not.toContainText(/Booking Pro|Booking setup|Calendar V2/i);
    await expect(page.getByTestId("booking-public-preview")).toContainText(/Open public link|Copy public booking link|Customer preview/i);
    await expect(page.getByTestId("booking-public-link")).not.toContainText(/\/portal\/booking\/|bookingPublicToken|token=/i);
    await expect(page.getByTestId("booking-mode-location")).toBeVisible();
    await expect(page.getByTestId("booking-mode-employee")).toBeVisible();
    await expect(page.getByTestId("booking-mode-hybrid")).toBeVisible();
    await expect(page.getByTestId("booking-service-public-visible")).toHaveAttribute("aria-label", "Visible publicly");
    await page.getByTestId("booking-service-public-visible").click();
    await expect(page.getByTestId("booking-service-public-visible")).toHaveAttribute("aria-label", "Hidden from public");
    await expect(page.getByTestId("booking-service-trade-visible")).toHaveAttribute("aria-label", "Trade-visible");
  });
});
