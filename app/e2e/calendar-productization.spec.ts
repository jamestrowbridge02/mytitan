import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.use({ viewport: { width: 1440, height: 900 } });

async function getToken(page: any) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return String(token || "");
}

test.describe("calendar productization", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("operators can switch day, week, and month views and see an empty-state message", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/calendar");
    await expect(page.getByTestId("calendar-premium-header").getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.getByTestId("calendar-create-booking")).toBeVisible();
    await expect(page.getByTestId("operations-command-lenses")).toBeVisible();
    await expect(page.getByTestId("operations-actionable-warnings")).toHaveCount(1);
    await expect(page.getByTestId("calendar-view-toggle-day")).toBeVisible();
    await page.getByPlaceholder("Search bookings...").fill("no matching bookings");
    await page.getByTestId("calendar-view-toggle-day").click();
    await expect(page.getByTestId("calendar-empty-state")).toBeVisible();
    await page.getByTestId("calendar-view-toggle-week").click();
    await expect(page.getByTestId("calendar-empty-state")).toBeVisible();
    await page.getByTestId("calendar-view-toggle-month").click();
    await expect(page.getByTestId("calendar-month-grid")).toBeVisible();
    await expect(page.getByTestId("calendar-empty-state")).toContainText(/No bookings match these filters/i);
    await expect(page.locator("body")).not.toContainText("Provider-neutral directions links");
    await expect(page.locator("body")).not.toContainText("No actionable scheduling warnings in this view");
  });

  test("rescheduling a booking in the calendar persists after reload", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/calendar");
    const token = await getToken(page);
    const from = "2026-03-16T00:00:00.000Z";
    const to = "2026-03-23T00:00:00.000Z";
    const technicianId = "e2e-user-technician";
    const bookingId = `pw-calendar-${Date.now()}`;
    const targetDay = "2026-03-18";
    const locationsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/locations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(locationsResponse.ok()).toBeTruthy();
    const locations = await locationsResponse.json();
    const primaryLocation = Array.isArray(locations) ? locations.find((location: any) => location?.isActive) || locations[0] : null;
    expect(primaryLocation?.id).toBeTruthy();
    const existingBookingsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/calendar/bookings?from=${encodeURIComponent(`${targetDay}T00:00:00.000Z`)}&to=${encodeURIComponent("2026-03-19T00:00:00.000Z")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(existingBookingsResponse.ok()).toBeTruthy();
    const existingBookingsBody = await existingBookingsResponse.json();
    const targetHour = (() => {
      const blocks = Array.isArray(existingBookingsBody?.blocks) ? existingBookingsBody.blocks : [];
      for (let hour = 8; hour <= 16; hour += 1) {
        const originalStart = new Date(`${targetDay}T${String(hour).padStart(2, "0")}:00:00.000Z`);
        const originalEnd = new Date(originalStart.getTime() + 60 * 60 * 1000);
        const movedStart = new Date(`${targetDay}T${String(hour).padStart(2, "0")}:30:00.000Z`);
        const movedEnd = new Date(movedStart.getTime() + 60 * 60 * 1000);
        const overlapsOriginal = blocks.some((block: any) => {
          if (block?.technician?.id !== technicianId) return false;
          const startsAt = new Date(block.startsAt);
          const endsAt = new Date(block.endsAt);
          return startsAt < originalEnd && endsAt > originalStart;
        });
        const overlapsMoved = blocks.some((block: any) => {
          if (block?.technician?.id !== technicianId) return false;
          const startsAt = new Date(block.startsAt);
          const endsAt = new Date(block.endsAt);
          return startsAt < movedEnd && endsAt > movedStart;
        });
        if (!overlapsOriginal && !overlapsMoved) return hour;
      }
      return 15;
    })();

    const createResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/bookings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        customerName: `Playwright Calendar ${bookingId}`,
        customerEmail: `${bookingId}@example.test`,
        customerPhone: "01133009900",
        startsAt: `${targetDay}T${String(targetHour).padStart(2, "0")}:00:00.000Z`,
        endsAt: `${targetDay}T${String(targetHour + 1).padStart(2, "0")}:00:00.000Z`,
        status: "PLANNED",
        locationId: primaryLocation.id,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createdBooking = await createResponse.json();

    await page.goto(`/dashboard/calendar?day=${targetDay}`);
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
    const rescheduleResponse = await request.patch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/calendar/bookings/${createdBooking.id}/reschedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        startsAt: `${targetDay}T${String(targetHour).padStart(2, "0")}:30:00.000Z`,
        endsAt: `${targetDay}T${String(targetHour + 1).padStart(2, "0")}:30:00.000Z`,
      },
    });
    expect(rescheduleResponse.ok()).toBeTruthy();
    let movedBooking: any = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bookingsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/calendar/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(bookingsResponse.ok()).toBeTruthy();
      const bookingsBody = await bookingsResponse.json();
      movedBooking = Array.isArray(bookingsBody?.blocks)
        ? bookingsBody.blocks.find((block: any) => block.id === createdBooking.id)
        : null;
      const movedStart = String(movedBooking?.startsAt || "");
      if (movedStart.includes(`T${String(targetHour).padStart(2, "0")}:30:00.000Z`)) {
        break;
      }
      await page.waitForTimeout(250);
    }
    expect(String(movedBooking?.startsAt || "")).toContain(`T${String(targetHour).padStart(2, "0")}:30:00.000Z`);

    await page.reload();
    await expect(page.getByTestId(`calendar-booking-${createdBooking.id}`).first()).toBeVisible();
  });
});
