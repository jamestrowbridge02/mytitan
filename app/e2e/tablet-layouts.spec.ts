import { expect, test } from "@playwright/test";
import { installApiProxy, requestLocalApi, resolveE2EAppUrl } from "./utils";

test.use({ viewport: { width: 820, height: 1180 } });

function pickPublicBookingStaffId(config: any) {
  const staff = Array.isArray(config?.staff) ? config.staff : [];
  const preferred =
    staff.find((entry: any) => /technician|staff/i.test(String(entry?.email || ""))) ||
    staff[0] ||
    null;
  return String(preferred?.id || "").trim() || null;
}

async function loginAndGetToken(request: any) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function createService(request: any, token: string) {
  const unique = Date.now();
  const response = await requestLocalApi(request, "/booking/services", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `Tablet Booking ${unique}`,
      description: "Tablet layout verification service",
      durationMinutes: "60",
      priceCents: "14900",
      discountPriceCents: "12900",
      depositType: "NONE",
      depositValue: "0",
      completionPaymentMode: "ON_COMPLETION",
      paymentProvider: "MANUAL",
      customerNotes: "Tablet layout verification notes.",
      isActive: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createPublicBookingWithStatus(request: any, token: string, service: any) {
  await requestLocalApi(request, "/bookings/settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      publicEnabled: true,
      blackoutDates: [],
      businessHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      })),
    },
  });

  const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(settingsResponse.ok()).toBeTruthy();
  const settings = await settingsResponse.json();
  const publicUrl = String(settings?.publicUrl || "");
  const publicToken = publicUrl.split("/").pop();
  expect(publicToken).toBeTruthy();

  const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  const staffUserId = pickPublicBookingStaffId(config);

  const candidateDates = Array.from({ length: 30 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + index + 1);
    return value.toISOString().slice(0, 10);
  }).filter((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });

  let startsAt = "";
  for (const targetDate of candidateDates) {
    const params = new URLSearchParams({ date: targetDate, serviceId: String(service.id || "") });
    if (staffUserId) params.set("staffUserId", staffUserId);
    const slotsResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?${params.toString()}`);
    expect(slotsResponse.ok()).toBeTruthy();
    const availability = await slotsResponse.json();
    if (Array.isArray(availability?.slots) && availability.slots.length > 0) {
      startsAt = String(availability.slots[0].startsAt || "");
      break;
    }
  }

  expect(startsAt).toBeTruthy();

  const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      serviceId: service.id,
      startsAt,
      ...(staffUserId ? { staffUserId } : {}),
      customerName: "Tablet Layout Customer",
      customerEmail: "tablet-layout@example.test",
    },
  });
  const createdBody = await createResponse.json();
  expect(createResponse.ok(), JSON.stringify(createdBody)).toBeTruthy();
  return createdBody;
}

async function expectViewportFit(page: any, selector?: string) {
  await expect
    .poll(
      async () =>
        page.evaluate((scopeSelector) => {
          const tolerance = 20;
          const doc = document.documentElement;
          const viewportWidth = Math.max(
            window.innerWidth,
            doc.clientWidth,
            Math.round(window.visualViewport?.width ?? 0),
          );
          const scope =
            (scopeSelector ? document.querySelector(scopeSelector) : null) as HTMLElement | null ||
            (document.querySelector(".mt-shell__main") as HTMLElement | null) ||
            document.body;
          const offenders = Array.from(scope.querySelectorAll<HTMLElement>("*"))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return {
                text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
                className: typeof element.className === "string" ? element.className : "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                display: style.display,
                visibility: style.visibility,
              };
            })
            .filter((entry) => {
              if (entry.display === "none" || entry.visibility === "hidden") return false;
              if (entry.width <= 0) return false;
              return entry.left < -tolerance || entry.right > viewportWidth + tolerance;
            })
            .slice(0, 5);
          return offenders.length === 0 ? "ok" : JSON.stringify(offenders);
        }, selector || null),
      { timeout: 2_500, intervals: [100, 250, 500] },
    )
    .toBe("ok");
}

test.describe("tablet layouts", () => {
  test("billing and operations stay legible on tablet", async ({ page, request }) => {
    await installApiProxy(page, request);
    const loginResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginBody = await loginResponse.json();
    await page.addInitScript((token) => window.localStorage.setItem("mytitan_token", token), String(loginBody?.token || ""));

    await page.goto("/dashboard/billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /mytitan account/i })).toBeVisible();
    await expectViewportFit(page);

    await page.goto("/dashboard/settings/payments", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("payments-hub")).toBeVisible();
    await expect(page.getByRole("heading", { name: /payments & invoices/i })).toBeVisible();
    await expectViewportFit(page);

    await page.goto("/dashboard/settings/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settings-operations-page")).toBeVisible();
    await expect(page.getByTestId("operations-readiness-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Advanced" })).toHaveCount(0);
    await expect(page.getByTestId("operations-governance-table")).toHaveCount(0);
    await expectViewportFit(page);
  });

  test("customer booking status page stays readable on tablet", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token);
    const created = await createPublicBookingWithStatus(request, token, service);
    const statusUrl = String(created?.statusUrl || "");

    expect(statusUrl).toContain("/portal/booking/status/");

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(statusUrl), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("public-booking-status-summary")).toContainText(service.name);
    await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
    await expect(page.getByRole("button", { name: /move booking/i })).toBeVisible();
    await expectViewportFit(page, ".booking-status-page");
  });
});
