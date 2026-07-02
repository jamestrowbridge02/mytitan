import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function apiLogin(request: any, email: string, password: string) {
  const response = await requestLocalApi(request, "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 3 workflow excellence", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("booking workflow settings persist and stay tenant-owned", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    const save = await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        autoCreateJobFromBooking: true,
        autoAssignWorkflow: true,
        manualReviewMode: true,
        locationFirstScheduling: true,
      },
    });
    expect(save.ok()).toBeTruthy();
    const saved = await save.json();
    expect(saved.bookingWorkflow).toMatchObject({
      autoCreateJobFromBooking: true,
      autoAssignWorkflow: true,
      manualReviewMode: true,
      locationFirstScheduling: true,
    });

    const viewerToken = await apiLogin(request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    const denied = await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
      data: { autoCreateJobFromBooking: false },
    });
    expect([403, 401]).toContain(denied.status());
  });

  test("bookings and calendar expose click-to-action workflow rails", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });
    const bookingRail = page.getByTestId("booking-click-to-action-rail");
    await expect(bookingRail).toBeVisible();
    await expect(bookingRail).toContainText("Convert ready bookings");
    await expect(bookingRail).toContainText("Plan by location");
    await expect(bookingRail.getByRole("link", { name: "Change workflow" })).toHaveAttribute("href", "/dashboard/booking/settings#workflow");

    await page.goto("/dashboard/calendar", { waitUntil: "networkidle" });
    const calendarRail = page.getByTestId("calendar-click-to-action-rail");
    await expect(calendarRail).toBeVisible();
    await expect(calendarRail).toContainText("Today's booking queue");
    await expect(calendarRail.getByRole("link", { name: "Edit workflow" })).toHaveAttribute("href", "/dashboard/booking/settings#workflow");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(overflow).toBe(false);
  });

  test("booking settings surface business workflow choices without exposing platform operations", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/dashboard/booking/settings#workflow", { waitUntil: "networkidle" });
    const controls = page.getByTestId("booking-workflow-controls");
    await expect(controls).toBeVisible();
    await expect(controls).toContainText("Create the job automatically after confirmation");
    await expect(controls).toContainText("Auto-assign using location and service rules");
    await expect(controls).toContainText("Location-based");
    await expect(controls).toContainText("Employee-based");
    await expect(controls).toContainText("Hybrid");
    await expect(page.getByText("External monitor intentionally deferred")).toHaveCount(0);
    await expect(page.getByText("Platform health")).toHaveCount(0);
  });
});
