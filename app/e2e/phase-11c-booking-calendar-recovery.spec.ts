import { expect, test } from "@playwright/test";
import { fixtureRefs, installApiProxy, loginAs, requestLocalApi } from "./utils";

function localDateTimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

test.describe("Phase 11C booking visibility and Calendar V2 recovery", () => {
  test("unassigned bookings remain visible in a selected location and Calendar V2 refreshes without reload", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    await page.addInitScript(() => {
      window.localStorage.setItem("mytitan_active_location_id_v1", "e2e-location-north");
    });

    const start = new Date();
    start.setDate(start.getDate() + 9);
    start.setHours(14, 15, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const suffix = Date.now();
    const customerName = `Phase 11C Visible Booking ${suffix}`;

    await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });
    await page.getByTestId("booking-create-customer-name").fill(customerName);
    await page.getByTestId("booking-create-start").fill(localDateTimeInput(start));
    await page.getByTestId("booking-create-end").fill(localDateTimeInput(end));
    await page.getByRole("button", { name: "Create booking", exact: true }).click();
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();

    const scopedResponse = await requestLocalApi(
      request,
      "/bookings?locationId=e2e-location-north",
      { headers },
    );
    expect(scopedResponse.ok()).toBeTruthy();
    const scopedBookings = await scopedResponse.json();
    const created = scopedBookings.find((booking: any) => booking.customerName === customerName);
    expect(created).toBeTruthy();
    expect(created.locationId).toBeNull();
    await expect(page.getByTestId(`booking-row-${created.id}`)).toBeVisible();

    const sidebar = page.getByTestId("sidebar-nav");
    await expect(sidebar.locator('a[href="/dashboard/calendar"]')).toHaveCount(1);
    await expect(sidebar.locator('a[href="/dashboard/scheduling"]')).toHaveCount(0);

    const day = start.toISOString().slice(0, 10);
    await page.goto(`/dashboard/calendar?day=${day}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("calendar-v2-workspace")).toHaveAttribute("data-calendar-version", "2");
    await expect(page.getByTestId(`calendar-booking-${created.id}`)).toBeVisible();
    await expect(page.getByTestId("calendar-empty-state")).toHaveCount(0);

    const secondStart = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const secondEnd = new Date(secondStart.getTime() + 60 * 60 * 1000);
    const secondResponse = await requestLocalApi(request, "/bookings", {
      method: "POST",
      headers,
      data: {
        startsAt: secondStart.toISOString(),
        endsAt: secondEnd.toISOString(),
        customerName: `Phase 11C Refresh Booking ${suffix}`,
      },
    });
    expect(secondResponse.ok()).toBeTruthy();
    const secondBooking = await secondResponse.json();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("mytitan:operational-data-changed", {
        detail: { path: "/bookings" },
      }));
    });
    await expect(page.getByTestId(`calendar-booking-${secondBooking.id}`)).toBeVisible();
    expect(page.url()).toContain(`/dashboard/calendar?day=${day}`);
  });

  test("operational refresh coalesces simultaneous mutation signals", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });

    let refreshRequests = 0;
    await page.route("**/bookings?*", async (route) => {
      refreshRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.evaluate(() => {
      for (let index = 0; index < 3; index += 1) {
        window.dispatchEvent(new CustomEvent("mytitan:operational-data-changed", {
          detail: { path: "/bookings" },
        }));
      }
    });
    await expect.poll(() => refreshRequests).toBe(1);
  });
});
