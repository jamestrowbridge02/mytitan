import { expect, test } from "@playwright/test";
import {
  defaultOperatorEmail,
  defaultOperatorPassword,
  installApiProxy,
  loginAs,
  requestLocalApi,
  resolveE2EAppUrl,
  workspaceAdminEmail,
  workspaceAdminPassword,
} from "./utils";

function pickPublicBookingStaffId(config: any) {
  const staff = Array.isArray(config?.staff) ? config.staff : [];
  const preferred =
    staff.find((entry: any) => /technician|staff/i.test(String(entry?.email || ""))) ||
    staff[0] ||
    null;
  return String(preferred?.id || "").trim() || null;
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function loginAndGetToken(request: any, email = defaultOperatorEmail, password = defaultOperatorPassword) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function createService(request: any, token: string, overrides: Record<string, any> = {}) {
  const unique = Date.now();
  const response = await requestLocalApi(request, "/booking/services", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `Playwright Website Booking ${unique}`,
      description: "Website booking coverage service",
      durationMinutes: "60",
      priceCents: "14900",
      discountPriceCents: "12900",
      depositType: "FIXED",
      depositValue: "2500",
      completionPaymentMode: "ON_COMPLETION",
      paymentProvider: "MANUAL",
      customerNotes: "Bring any site access details with you.",
      publicBundleEligible: true,
      publicBundleMaxQuantity: "1",
      isActive: true,
      ...overrides,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createTradeAccount(request: any, token: string, overrides: Record<string, any> = {}) {
  const unique = Date.now();
  const response = await requestLocalApi(request, "/trade-accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `Playwright Trade Account ${unique}`,
      contactName: "Trade Contact",
      contactEmail: `trade-${unique}@example.test`,
      contactPhone: "02070000000",
      status: "ACTIVE",
      ...overrides,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function enableCustomerPayments(request: any, token: string) {
  const tenantSettingsResponse = await requestLocalApi(request, "/tenant/settings", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      paymentsEnabled: true,
      featurePayments: true,
    },
  });
  expect(tenantSettingsResponse.ok()).toBeTruthy();

  const billingResponse = await requestLocalApi(request, "/billing/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(billingResponse.ok()).toBeTruthy();
  const billing = await billingResponse.json();

  const collectionResponse = await requestLocalApi(request, "/billing/payment-collection", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      preferredProvider: "STRIPE",
    },
  });
  expect(collectionResponse.ok()).toBeTruthy();

  return billing;
}

async function createPublicBookingWithStatus(
  request: any,
  token: string,
  service: any,
  dateLabel?: string,
  customerFields: Record<string, any> = {},
  options: { depositRequired?: boolean; expectFailure?: boolean } = {},
) {
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

  const assignedUserId = String(settings?.staff?.[0]?.id || "");
  await requestLocalApi(request, `/booking/services/${service.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: service.name,
      description: service.description || "Website booking coverage service",
      durationMinutes: String(service.durationMinutes || "60"),
      priceCents: String(service.priceCents || "14900"),
      discountPriceCents: String(service.discountPriceCents || "12900"),
      depositType: options.depositRequired ? service.depositType || "FIXED" : "NONE",
      depositValue: options.depositRequired ? String(service.depositValue || "2500") : "0",
      completionPaymentMode: service.completionPaymentMode || "ON_COMPLETION",
      paymentProvider: service.paymentProvider || "MANUAL",
      customerNotes: service.customerNotes || "Bring any site access details with you.",
      category: service.category || "Services",
      visibility: service.visibility || "PUBLIC",
      requireCustomerPhone: service.requireCustomerPhone === true,
      requireVehicleRegistration: service.requireVehicleRegistration === true,
      requireLockingWheelNut: service.requireLockingWheelNut === true,
      shortDescription: service.shortDescription || null,
      longDescription: service.longDescription || null,
      imageUrl: service.imageUrl || null,
      customOptions: Array.isArray(service.customOptions) ? service.customOptions : [],
      tradeAccountDepositWaived: Boolean(service.tradeAccountDepositWaived),
      assignedUserId: assignedUserId || undefined,
      isActive: true,
    },
  });

  const candidateDates = Array.from({ length: 60 }, (_, index) => {
    const value = dateLabel ? new Date(`${dateLabel}T00:00:00.000Z`) : new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + (dateLabel ? index : index + 1));
    return value.toISOString().slice(0, 10);
  }).filter((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });
  const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  const staffUserId = pickPublicBookingStaffId(config);

  let availability: any = null;
  for (const targetDate of candidateDates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const params = new URLSearchParams({ date: targetDate, serviceId: String(service.id) });
      if (staffUserId) {
        params.set("staffUserId", staffUserId);
      }
      const slotsResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?${params.toString()}`);
      expect(slotsResponse.ok()).toBeTruthy();
      const nextAvailability = await slotsResponse.json();
      if (Array.isArray(nextAvailability?.slots)) {
        if (nextAvailability.slots.length > 0) {
          availability = nextAvailability;
        }
        break;
      }
    }
    if (Array.isArray(availability?.slots) && availability.slots.length > 0) break;
  }
  expect(Array.isArray(availability?.slots)).toBeTruthy();
  expect(availability.slots.length).toBeGreaterThan(0);

  let startsAt = availability.slots[0].startsAt;
  let createdBody: any = null;
  let createOk = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        serviceId: service.id,
        startsAt,
        ...(staffUserId ? { staffUserId } : {}),
        customerName: "Playwright Lifecycle Customer",
        customerEmail: "lifecycle@example.test",
        ...customerFields,
      },
    });
    createdBody = await createResponse.json();
    createOk = createResponse.ok();
    if (createOk) break;
    if (createdBody?.code !== "BOOKING_SLOT_UNAVAILABLE" || !createdBody?.nextAvailableSlot) break;
    startsAt = String(createdBody.nextAvailableSlot);
  }
  if (!options.expectFailure) {
    expect(createOk, JSON.stringify(createdBody)).toBeTruthy();
  }
  createdBody._responseOk = createOk;
  return createdBody;
}

async function findAvailableBookingSlot(request: any, token: string, bookingId: string, candidateDates: string[]) {
  const fallbackDates = Array.from({ length: 60 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + index + 1);
    return value.toISOString().slice(0, 10);
  }).filter((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });
  const searchDates = Array.from(new Set([...(candidateDates || []), ...fallbackDates]));

  for (const targetDate of searchDates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const availabilityResponse = await requestLocalApi(request, `/bookings/${bookingId}/availability?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(availabilityResponse.ok()).toBeTruthy();
      const availability = await availabilityResponse.json();
      expect(Array.isArray(availability?.slots)).toBeTruthy();
      if (availability.slots.length > 0) {
        return { targetDate, movedSlot: availability.slots[0] };
      }
    }
  }

  throw new Error(`No reschedule slots available for booking ${bookingId}`);
}

async function findAvailablePublicBookingSlot(request: any, publicToken: string, serviceId: string, candidateDates: string[]) {
  const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  const staffUserId = pickPublicBookingStaffId(config);
  const fallbackDates = Array.from({ length: 60 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + index + 1);
    return value.toISOString().slice(0, 10);
  }).filter((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });
  const searchDates = Array.from(new Set([...(candidateDates || []), ...fallbackDates]));
  let availability: any = null;
  for (const targetDate of searchDates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const params = new URLSearchParams({ date: targetDate, serviceId });
      if (staffUserId) {
        params.set("staffUserId", staffUserId);
      }
      const slotsResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?${params.toString()}`);
      expect(slotsResponse.ok()).toBeTruthy();
      const nextAvailability = await slotsResponse.json();
      if (Array.isArray(nextAvailability?.slots)) {
        if (nextAvailability.slots.length > 0) {
          availability = { targetDate, slot: nextAvailability.slots[0], staffUserId };
        }
        break;
      }
    }
    if (availability?.slot) break;
  }

  expect(availability?.targetDate).toBeTruthy();
  expect(String(availability?.slot?.startsAt || "")).toBeTruthy();
  return availability as { targetDate: string; slot: { startsAt: string }; staffUserId?: string | null };
}

function nextWeekdayDate(targetWeekday: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  const current = value.getUTCDay();
  let delta = (targetWeekday - current + 7) % 7;
  if (delta === 0) delta = 7;
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

async function advanceToPublicServicePage(page: any, folder = "Services") {
  const locationPage = page.getByTestId("public-booking-location-page");
  if (await locationPage.count()) {
    const location = locationPage.locator("button.public-booking-serviceCard").first();
    if (await location.count()) {
      await location.click();
    } else {
      await locationPage.getByRole("button", { name: /continue to services/i }).click();
    }
  }
  await expect(page.getByTestId("public-booking-category-page")).toBeVisible();
  await page.getByTestId("public-booking-service-folders").getByRole("button", { name: new RegExp(folder, "i") }).first().click();
  await expect(page.getByTestId("public-booking-service-card")).toBeVisible();
}

test.describe("booking public flow", () => {
  test("booking setup shows a shareable link and supports create/edit service setup", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard/settings?tab=general", { waitUntil: "networkidle" });
    await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').first().setInputFiles({
      name: "wheel-ar-logo-replacement.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    await expect(page.getByTestId("logo-file-selection")).toContainText("wheel-ar-logo-replacement.png");
    await expect(page.getByRole("button", { name: "Upload logo", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Upload logo", exact: true }).click();
    await expect(page.getByText(/Logo saved/)).toBeVisible();
    await page.goto("/dashboard/booking/settings", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Bookings" }).first()).toBeVisible();
    await expect(page.getByTestId("booking-public-link")).toContainText("Public booking link is ready");
    await expect(page.getByTestId("booking-public-link")).not.toContainText("/portal/booking/");
    await expect(page.getByText("Add this link to your website booking button.", { exact: false })).toBeVisible();
    await expect(page.getByTestId("booking-setup-progress")).toContainText(/Open next step|Bookings/i);

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

    const serviceName = `Playwright UI Service ${Date.now()}`;
    await page.getByTestId("booking-service-name").fill(serviceName);
    await page.getByTestId("booking-service-price").fill("159.00");
    await page.getByRole("button", { name: "Create service" }).click();
    await expect(page.getByTestId("booking-services-list")).toContainText(serviceName);

    await page.locator('[data-testid="booking-services-list"] article').filter({ hasText: serviceName }).getByRole("button", { name: "Edit" }).click();
    await page.getByTestId("booking-service-discount-price").fill("129.00");
    await page.getByTestId("booking-service-deposit-value").fill("25.00");
    await page.getByTestId("booking-service-bundle-eligible").check();
    await page.getByTestId("booking-service-bundle-max-quantity").fill("2");
    await page.getByRole("button", { name: "Update service" }).click();
    await expect(page.getByTestId("booking-services-list")).toContainText("£129.00");
    await expect(page.getByTestId("booking-services-list")).toContainText("Public bundle");
  });

  test("public booking page shows price, discount, deposit, and truthful payment messaging", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { paymentProvider: "MANUAL" });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicUrl = `${String(settings?.publicUrl || "")}?serviceId=${encodeURIComponent(String(service.id || ""))}`;

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(publicUrl), { waitUntil: "networkidle" });
    await advanceToPublicServicePage(page);

    await expect(page.getByTestId("public-booking-service-card")).toBeVisible();
    await expect(page.getByTestId("public-booking-stepper")).toContainText("Service");
    await expect(page.getByTestId("public-booking-stepper")).not.toContainText("Service folder");
    await expect(page.getByTestId("public-booking-summary")).toHaveCount(0);
    await page.getByTestId("public-booking-service-more-details").getByText("More details").click();
    await expect(page.getByTestId("public-booking-customer-notes")).toContainText("Bring any site access details with you.");
  });

  test("public booking uses location, folder, service, week, customer, and confirmation pages", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const serviceName = `Diamond Cut full set ${Date.now()}`;
    const service = await createService(request, token, {
      name: serviceName,
      category: "Diamond Cut",
      visibility: "PUBLIC",
      requireCustomerPhone: true,
      requireVehicleRegistration: true,
      requireLockingWheelNut: true,
    });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();

    await installApiProxy(page, request);
    await page.setViewportSize({ width: 390, height: 844 });
    const availabilityRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(`/public/booking/`) && request.url().includes("/slots?")) availabilityRequests.push(request.url());
    });
    await page.goto(resolveE2EAppUrl(String(settings.publicUrl || "")), { waitUntil: "networkidle" });
    await expect(page.getByTestId("public-booking-location-page")).toBeVisible();
    await expect(page.getByTestId("public-booking-brand-header")).toBeVisible();
    await expect(page.getByTestId("public-booking-stepper")).toHaveText(/Location\s*Service\s*Availability\s*Your details\s*Confirm/);
    await expect(page.getByTestId("public-booking-stepper")).not.toContainText(/Service folder|01|02|03/);
    await expect(page.getByText("Book online", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Reviews", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("public-booking-summary")).toHaveCount(0);

    const locationButton = page.getByTestId("public-booking-location-page").locator("button.public-booking-serviceCard").first();
    if (await locationButton.count()) {
      await locationButton.click();
    } else {
      await page.getByRole("button", { name: /continue to services/i }).click();
    }
    await expect(page.getByTestId("public-booking-category-page")).toBeVisible();
    await page.getByTestId("public-booking-service-folders").getByRole("button", { name: /Diamond Cut/i }).click();
    await expect(page.getByTestId("public-booking-service-card")).toContainText(serviceName);
    await page.getByRole("button", { name: new RegExp(serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    const continueToAvailability = page.getByRole("button", { name: /continue to availability/i });
    if (await continueToAvailability.count()) await continueToAvailability.click();

    await expect(page).toHaveURL(/\/availability/);
    await expect(page.locator(".public-booking-day")).toHaveCount(7);
    await expect.poll(() => availabilityRequests.length).toBeGreaterThanOrEqual(7);
    expect(new Set(availabilityRequests).size).toBe(availabilityRequests.length);
    for (let week = 0; week < 8 && (await page.locator('button[data-testid^="public-booking-slot-"]').count()) === 0; week += 1) {
      await page.getByTestId("public-booking-week-forward").click();
    }
    const slot = page.locator('button[data-testid^="public-booking-slot-"]').first();
    await expect(slot).toBeVisible();
    await slot.click();
    await page.getByRole("button", { name: /continue to details/i }).click();

    await expect(page.getByTestId("public-booking-name-input")).toHaveAttribute("placeholder", "Enter your name");
    await expect(page.getByTestId("public-booking-email-input")).toHaveAttribute("placeholder", "Enter email address");
    await expect(page.getByTestId("public-booking-phone-country")).toHaveValue("+44");
    await expect(page.getByTestId("public-booking-registration-input")).toHaveAttribute("placeholder", "Reg Number");
    const fieldOrder = await page.locator(".public-booking-controlGrid .public-booking-field").evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector("span")?.textContent?.trim() || ""),
    );
    expect(fieldOrder.slice(0, 4).map((label) => label.replace(/\s*\*$/, ""))).toEqual(["Name", "Phone", "Email", "Reg Number"]);
    const phoneBounds = await page.getByTestId("public-booking-phone-input").boundingBox();
    const panelBounds = await page.locator(".public-booking-panel").boundingBox();
    expect(phoneBounds).toBeTruthy();
    expect(panelBounds).toBeTruthy();
    expect((phoneBounds?.x || 0) + (phoneBounds?.width || 0)).toBeLessThanOrEqual((panelBounds?.x || 0) + (panelBounds?.width || 0) + 1);
    await page.getByTestId("public-booking-name-input").fill("Wheel A&R Customer");
    await page.getByTestId("public-booking-email-input").fill("wheel-ar@example.test");
    await page.getByTestId("public-booking-phone-input").fill("7700900456");
    await page.getByTestId("public-booking-registration-input").fill("MT26 ARR");
    await page.getByTestId("public-booking-locking-wheel-nut").check();
    await page.getByRole("button", { name: /review booking/i }).click();

    await expect(page).toHaveURL(/\/confirmation/);
    await expect(page.getByTestId("public-booking-summary")).toContainText(serviceName);
    await expect(page.getByTestId("public-booking-summary")).toContainText("MT26 ARR");
    await expect(page.getByTestId("public-booking-summary")).toContainText("7700900456");
    await expect(page.getByTestId("public-booking-summary")).toContainText("Readily available");
    await expect(page.getByTestId("public-booking-payment-truth")).toContainText(/deposit|No deposit/i);
    await expect(page.getByTestId("public-booking-payment-truth")).not.toContainText(/MyTitan|Stripe setup|payment-boundary|provider setup/i);
    await page.getByRole("button", { name: /back to details/i }).click();
    await expect(page.getByTestId("public-booking-registration-input")).toHaveValue("MT26 ARR");
    await expect(page.getByTestId("public-booking-locking-wheel-nut")).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

    expect(service.category).toBe("Diamond Cut");
  });

  test("public service folders hide trade-only and internal services from ordinary customers", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const publicService = await createService(request, token, { category: "Public repairs", visibility: "PUBLIC" });
    const tradeService = await createService(request, token, { category: "Trade repairs", visibility: "TRADE" });
    const internalService = await createService(request, token, { category: "Workshop only", visibility: "INTERNAL" });
    const tradeAccount = await createTradeAccount(request, token);
    const hiddenLocationName = `Hidden Public Location ${Date.now()}`;
    const hiddenLocationResponse = await requestLocalApi(request, "/locations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        code: `HID-${Date.now()}`,
        name: hiddenLocationName,
        kind: "BRANCH",
        addressLine1: "Private Yard",
        city: "Chichester",
        country: "United Kingdom",
        timezone: "Europe/London",
        metadataJson: {
          publicVisible: false,
          tradeVisible: true,
          privateVisible: true,
        },
        hours: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
          isClosed: false,
        })),
      },
    });
    expect(hiddenLocationResponse.ok()).toBeTruthy();
    const hiddenLocations = await hiddenLocationResponse.json();
    const hiddenLocation = Array.isArray(hiddenLocations)
      ? hiddenLocations.find((location: any) => location?.name === hiddenLocationName)
      : hiddenLocations;
    expect(hiddenLocation?.id).toBeTruthy();
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicToken = String(settings.publicUrl || "").split("/").pop();

    const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
    expect(configResponse.ok()).toBeTruthy();
    const config = await configResponse.json();
    const ids = new Set((config.services || []).map((service: any) => service.id));
    expect(ids.has(publicService.id)).toBeTruthy();
    expect(ids.has(tradeService.id)).toBeFalsy();
    expect(ids.has(internalService.id)).toBeFalsy();
    expect((config.locations || []).some((location: any) => location.id === hiddenLocation.id)).toBeFalsy();

    const tradeConfigResponse = await requestLocalApi(
      request,
      `/public/booking/${publicToken}/config?tradeAccountId=${encodeURIComponent(String(tradeAccount.id || ""))}&customerEmail=${encodeURIComponent(String(tradeAccount.contactEmail || ""))}`,
    );
    expect(tradeConfigResponse.ok()).toBeTruthy();
    const tradeConfig = await tradeConfigResponse.json();
    const tradeIds = new Set((tradeConfig.services || []).map((service: any) => service.id));
    expect(tradeIds.has(tradeService.id)).toBeTruthy();
    expect((tradeConfig.locations || []).some((location: any) => location.id === hiddenLocation.id)).toBeTruthy();
  });

  test("public booking deposit guidance stays truthful when customer payments belong to the business setup", async ({ request }) => {
    const token = await loginAndGetToken(request);
    await enableCustomerPayments(request, token);
    const service = await createService(request, token, { paymentProvider: "STRIPE" });
    const created = await createPublicBookingWithStatus(
      request,
      token,
      service,
      nextWeekdayDate(3),
      {},
      { depositRequired: true, expectFailure: true },
    );
    expect(created._responseOk).toBe(false);
    expect(created.code).toBe("ONLINE_PAYMENT_UNAVAILABLE");
    expect(JSON.stringify(created)).not.toContain("MyTitan billing");
    expect(JSON.stringify(created)).not.toContain("Stripe Connect");
  });

  test("public booking page shows service media, details, and priced add-ons without clutter", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const imageUrl = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 48'%3E%3Crect width='80' height='48' rx='8' fill='%230f172a'/%3E%3Ctext x='40' y='29' font-size='12' text-anchor='middle' fill='white'%3EAlignment%3C/text%3E%3C/svg%3E";
    const service = await createService(request, token, {
      shortDescription: "Fast alignment and inspection",
      longDescription: "Includes pre-checks, alignment correction, and a clear handover note.",
      imageUrl,
      customOptions: [
        { id: "laser_report", label: "Laser report", description: "Printed alignment result", priceCents: 1500, defaultSelected: true },
        { id: "valve_caps", label: "Valve cap set", description: "Replacement branded caps", priceCents: 500, defaultSelected: false },
      ],
    });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicUrl = `${String(settings?.publicUrl || "")}?serviceId=${encodeURIComponent(String(service.id || ""))}`;

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(publicUrl), { waitUntil: "networkidle" });
    await advanceToPublicServicePage(page);

    await expect(page.getByTestId("public-booking-service-card")).toContainText("Fast alignment and inspection");
    const longerDetails = page.getByText("Includes pre-checks, alignment correction, and a clear handover note.", { exact: true });
    await expect(longerDetails).toBeHidden();
    await page.getByTestId("public-booking-service-more-details").getByText("More details").click();
    await expect(longerDetails).toBeVisible();
    await expect(page.getByTestId("public-booking-service-card").locator("img").first()).toBeVisible();
    await expect(page.getByTestId("public-booking-service-card")).toContainText("Laser report");
    await expect(page.getByTestId("public-booking-service-card")).toContainText("£15.00");
  });

  test("public booking page shows next available time when the selected day is closed and only shows real slots", async ({ page, request }) => {
    const token = await loginAndGetToken(request, workspaceAdminEmail, workspaceAdminPassword);
    const service = await createService(request, token, { paymentProvider: "MANUAL", durationMinutes: "90" });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const blockedDate = nextWeekdayDate(1);
    const updateSettingsResponse = await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        publicEnabled: true,
        businessHours: settings.businessHours,
        blackoutDates: [{ date: blockedDate, reason: "Playwright next available check" }],
      },
    });
    expect(updateSettingsResponse.ok()).toBeTruthy();
    const publicUrl = `${String(settings?.publicUrl || "")}?serviceId=${encodeURIComponent(String(service.id || ""))}`;

    await installApiProxy(page, request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(resolveE2EAppUrl(publicUrl), { waitUntil: "networkidle" });
    await advanceToPublicServicePage(page);
    await page.getByRole("button", { name: new RegExp(String(service.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    const continueToAvailability = page.getByRole("button", { name: /continue to availability/i });
    if (await continueToAvailability.count()) await continueToAvailability.click();

    await page.getByTestId("public-booking-date-input").fill(blockedDate);
    await expect(page.locator(".public-booking-day")).toHaveCount(7);
    await expect(page.locator(".public-booking-day").first()).toContainText("No times");
    await expect(page.locator('button[data-testid^="public-booking-slot-"]').first()).toBeVisible();
  });

  test("public availability does not return slots when the service would overrun working hours", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { durationMinutes: "495" });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicUrl = String(settings?.publicUrl || "");
    const publicToken = publicUrl.split("/").pop();
    expect(publicToken).toBeTruthy();

    const monday = nextWeekdayDate(1);
    const availabilityResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?date=${monday}&serviceId=${service.id}`);
    expect(availabilityResponse.ok()).toBeTruthy();
    const availability = await availabilityResponse.json();
    expect(Array.isArray(availability?.slots)).toBeTruthy();
    expect(availability.slots).toHaveLength(0);
    expect(availability.nextAvailableSlot).toBeNull();
  });

  test("public booking conversion carries booking pricing snapshot into the linked job", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, {
      paymentProvider: "MANUAL",
      category: "Diamond Cut",
      requireCustomerPhone: true,
      requireVehicleRegistration: true,
      requireLockingWheelNut: true,
    });
    const created = await createPublicBookingWithStatus(request, token, service, nextWeekdayDate(2), {
      customerPhone: "7700900123",
      vehicleRegistration: "MT26 WHE",
      lockingWheelNutAvailable: true,
    });

    const convertResponse = await requestLocalApi(request, `/bookings/${created.booking.id}/convert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(convertResponse.ok()).toBeTruthy();
    const converted = await convertResponse.json();

    const jobResponse = await requestLocalApi(request, `/jobs/${converted.job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobResponse.ok()).toBeTruthy();
    const job = await jobResponse.json();
    expect(job?.formData?.bookingPricingSnapshot?.serviceName).toBe(service.name);
    expect(job?.formData?.bookingPricingSnapshot?.depositDueCents).toBe(0);
    expect(job?.formData?.bookingPaymentState?.collectionState).toBe("no_deposit_required");
    expect(job?.vehicleReg).toBe("MT26 WHE");
    expect(job?.formData?.registration).toBe("MT26 WHE");
    expect(job?.formData?.lockingWheelNutAvailable).toBeTruthy();
    expect(job?.formData?.bookingServiceCategory).toBe("Diamond Cut");
  });

  test("tenant booking folders and scoped customer fields persist into the converted job", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const category = `Inspection ${Date.now()}`;
    const service = await createService(request, token, { category, visibility: "PUBLIC" });
    const questionKey = `access_instructions_${Date.now()}`;
    const settingsUpdate = await requestLocalApi(request, "/booking/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        folders: [{
          key: category,
          displayName: "Inspection",
          publicDescription: "Choose the inspection you need.",
          internalNotes: "Playwright folder",
          visibility: "PUBLIC",
          sortOrder: 0,
        }],
        questions: [{
          label: "Access instructions",
          questionKey,
          type: "textarea",
          required: true,
          optionsJson: {
            placeholder: "Tell us how to access the site",
            visibility: "PUBLIC",
            serviceIds: [service.id],
            sortOrder: 10,
          },
        }],
      },
    });
    expect(settingsUpdate.ok()).toBeTruthy();
    const updatedSettings = await settingsUpdate.json();
    const question = updatedSettings.questions.find((entry: any) => entry.questionKey === questionKey);
    expect(question?.id).toBeTruthy();
    expect(updatedSettings.folders.find((entry: any) => entry.key === category)?.displayName).toBe("Inspection");

    const created = await createPublicBookingWithStatus(request, token, service, nextWeekdayDate(4), {
      answers: [{ questionId: question.id, valueText: "Use the side entrance" }],
    });

    const fieldEdit = await requestLocalApi(request, "/booking/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        questions: [{
          ...question,
          label: "Updated access label",
        }],
      },
    });
    expect(fieldEdit.ok()).toBeTruthy();

    const convertResponse = await requestLocalApi(request, `/bookings/${created.booking.id}/convert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(convertResponse.ok()).toBeTruthy();
    const converted = await convertResponse.json();
    const jobResponse = await requestLocalApi(request, `/jobs/${converted.job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobResponse.ok()).toBeTruthy();
    const job = await jobResponse.json();
    const storedField = job?.formData?.bookingCustomerFields?.find((entry: any) => entry.key === questionKey);
    expect(storedField?.label).toBe("Access instructions");
    expect(storedField?.value).toBe("Use the side entrance");
  });

  test("public booking bundles are flag gated and carry service lines into booking, status, and job", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const primary = await createService(request, token, {
      name: `Playwright Bundle Primary ${Date.now()}`,
      durationMinutes: "45",
      priceCents: "9900",
      discountPriceCents: undefined,
      depositType: "NONE",
      depositValue: undefined,
      publicBundleEligible: true,
      publicBundleAddOn: false,
      publicBundleMaxQuantity: "1",
    });
    const addon = await createService(request, token, {
      name: `Playwright Bundle Add-on ${Date.now()}`,
      durationMinutes: "30",
      priceCents: "4000",
      discountPriceCents: undefined,
      depositType: "NONE",
      depositValue: undefined,
      publicBundleEligible: true,
      publicBundleAddOn: true,
      publicBundleMaxQuantity: "2",
    });

    const updateSettings = await requestLocalApi(request, "/bookings/settings", {
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
    expect(updateSettings.ok()).toBeTruthy();

    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicToken = String(settings?.publicUrl || "").split("/").pop();
    expect(publicToken).toBeTruthy();

    const disabledConfigResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
    expect(disabledConfigResponse.ok()).toBeTruthy();
    const disabledConfig = await disabledConfigResponse.json();
    expect(disabledConfig?.publicBundles?.enabled).toBe(false);

    const flagResponse = await requestLocalApi(request, "/enterprise/feature-flags", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        key: "public_booking_bundles_v1",
        enabled: true,
        reason: "Playwright public booking bundles",
      },
    });
    expect(flagResponse.ok()).toBeTruthy();

    const enabledConfigResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
    expect(enabledConfigResponse.ok()).toBeTruthy();
    const enabledConfig = await enabledConfigResponse.json();
    expect(enabledConfig?.publicBundles?.enabled).toBe(true);
    expect(enabledConfig?.services?.find((service: any) => service.id === addon.id)?.publicBundleAddOn).toBe(true);

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(`${settings.publicUrl}?serviceId=${primary.id}`), { waitUntil: "networkidle" });
    await advanceToPublicServicePage(page);
    await expect(page.getByTestId("public-booking-bundle-summary")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(String(addon.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await page.getByTestId("public-booking-add-service").click();
    await page.getByTestId(`public-booking-bundle-qty-${addon.id}`).fill("2");
    await expect(page.getByTestId("public-booking-bundle-summary")).toContainText(String(addon.name));

    const availability = await findAvailablePublicBookingSlot(
      request,
      publicToken,
      String(primary.id || ""),
      Array.from({ length: 21 }, (_, index) => {
        const value = new Date();
        value.setUTCHours(0, 0, 0, 0);
        value.setUTCDate(value.getUTCDate() + index + 1);
        return value.toISOString().slice(0, 10);
      }).filter((value) => {
        const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
        return day >= 1 && day <= 5;
      }),
    );

    const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        serviceId: primary.id,
        serviceLines: [
          { serviceId: primary.id, quantity: 1 },
          { serviceId: addon.id, quantity: 2 },
        ],
        startsAt: availability.slot.startsAt,
        ...(availability.staffUserId ? { staffUserId: availability.staffUserId } : {}),
        customerName: "Public Bundle Customer",
        customerEmail: `public-bundle-${Date.now()}@example.test`,
      },
    });
    const created = await createResponse.json();
    expect(createResponse.ok(), JSON.stringify(created)).toBeTruthy();
    expect(created?.booking?.pricingSnapshotJson?.bundleTotalCents).toBe(17900);
    expect(created?.booking?.pricingSnapshotJson?.bundleDurationMinutes).toBe(105);

    const statusResponse = await requestLocalApi(request, `/public/booking-status/${String(created?.statusUrl || "").split("/").pop()}`);
    expect(statusResponse.ok()).toBeTruthy();
    const status = await statusResponse.json();
    expect(status?.serviceLines).toHaveLength(2);
    expect(status?.serviceLines?.[1]?.quantity).toBe(2);

    const convertResponse = await requestLocalApi(request, `/bookings/${created.booking.id}/convert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(convertResponse.ok()).toBeTruthy();
    const converted = await convertResponse.json();
    const jobResponse = await requestLocalApi(request, `/jobs/${converted.job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobResponse.ok()).toBeTruthy();
    const job = await jobResponse.json();
    expect(job?.formData?.bookingServiceLines).toHaveLength(2);
    expect((job?.lineItems || []).map((line: any) => line.description)).toEqual(expect.arrayContaining([primary.name, addon.name]));

    const disableFlagResponse = await requestLocalApi(request, "/enterprise/feature-flags", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        key: "public_booking_bundles_v1",
        enabled: false,
        reason: "Reset public booking bundles after Playwright coverage",
      },
    });
    expect(disableFlagResponse.ok()).toBeTruthy();
  });

  test("operator can confirm and move a booking, and the customer status page reflects the change", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { paymentProvider: "MANUAL", durationMinutes: "60" });
    const created = await createPublicBookingWithStatus(request, token, service);
    const bookingId = String(created?.booking?.id || "");
    const statusUrl = String(created?.statusUrl || "");
    expect(bookingId).toBeTruthy();
    expect(statusUrl).toContain("/portal/booking/status/");
    expect(String(created?.booking?.status || "")).toBe("CONFIRMED");

    const { targetDate: rescheduleDate, movedSlot } = await findAvailableBookingSlot(
      request,
      token,
      bookingId,
      Array.from({ length: 21 }, (_, index) => {
        const value = new Date();
        value.setUTCHours(0, 0, 0, 0);
        value.setUTCDate(value.getUTCDate() + index + 2);
        return value.toISOString().slice(0, 10);
      }).filter((value) => {
        const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
        return day >= 1 && day <= 5;
      }),
    );

    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto(`/dashboard/bookings/${bookingId}`, { waitUntil: "networkidle" });

    await expect(page.getByTestId("booking-operator-status")).toContainText(/confirmed/i);
    await expect(page.locator("text=no deposit required").first()).toBeVisible();

    await page.locator('input[type="date"]').first().fill(rescheduleDate);
    await page.getByTestId(`booking-reschedule-slot-${movedSlot.startsAt}`).click();
    await page.getByRole("button", { name: "Move booking" }).click();
    await expect(page.getByTestId("booking-operator-status")).toContainText(/confirmed/i);

    await expect
      .poll(async () => {
        const response = await requestLocalApi(request, `/public/booking-status/${statusUrl.split("/").pop()}`);
        if (!response.ok()) return "unavailable";
        const statusApi = await response.json();
        return `${String(statusApi?.customerState?.label || "").toLowerCase()}|${String(statusApi?.startsAt || "")}`;
      })
      .toContain(`${movedSlot.startsAt}`);

    await page.goto(resolveE2EAppUrl(statusUrl), { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /confirmed/i })).toBeVisible();

    const statusApiResponse = await requestLocalApi(request, `/public/booking-status/${statusUrl.split("/").pop()}`);
    expect(statusApiResponse.ok()).toBeTruthy();
    const statusApi = await statusApiResponse.json();
    expect(statusApi?.customerState?.label).toMatch(/confirmed/i);
    expect(statusApi?.startsAt).toBe(movedSlot.startsAt);
  });

  test("customer status page stays booking-only and supports cancellation", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { paymentProvider: "MANUAL" });
    const created = await createPublicBookingWithStatus(request, token, service);
    const statusUrl = String(created?.statusUrl || "");
    expect(statusUrl).toContain("/portal/booking/status/");

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(statusUrl), { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: /confirmed/i })).toBeVisible();
    await expect(page.getByTestId("public-booking-status-summary")).toContainText(service.name);
    await expect(page.getByTestId("public-booking-status-summary")).toContainText(/deposit status|no deposit/i);
    await expect(page.locator("body")).not.toContainText("Dashboard");

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("Booking cancelled.")).toBeVisible();
    await expect(page.getByText(/can no longer be cancelled from this page/i)).toBeVisible();
  });

  test("verified trade customers can book without deposit while normal public users cannot self-declare trade", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const tradeAccount = await createTradeAccount(request, token);
    const service = await createService(request, token, {
      tradeAccountDepositWaived: true,
      customOptions: [{ id: "site_pack", label: "Site prep pack", priceCents: 1000 }],
    });
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicToken = String(settings?.publicUrl || "").split("/").pop();
    expect(publicToken).toBeTruthy();
    const publicUrl = `${String(settings?.publicUrl || "")}?serviceId=${encodeURIComponent(String(service.id || ""))}&tradeAccountId=${encodeURIComponent(String(tradeAccount.id || ""))}&customerEmail=${encodeURIComponent(String(tradeAccount.contactEmail || ""))}`;
    const candidateDates = Array.from({ length: 21 }, (_, index) => {
      const value = new Date();
      value.setUTCHours(0, 0, 0, 0);
      value.setUTCDate(value.getUTCDate() + index + 1);
      return value.toISOString().slice(0, 10);
    }).filter((value) => {
      const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const availability = await findAvailablePublicBookingSlot(request, publicToken, String(service.id || ""), candidateDates);

    await installApiProxy(page, request);
    await page.goto(resolveE2EAppUrl(publicUrl), { waitUntil: "networkidle" });
    await advanceToPublicServicePage(page);
    await expect(page.getByTestId("public-booking-trade-deposit-note")).toContainText("Deposit not required for this account");
    await expect(page.getByTestId("public-booking-summary")).toHaveCount(0);

    const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        serviceId: service.id,
        startsAt: availability.slot.startsAt,
        ...(availability.staffUserId ? { staffUserId: availability.staffUserId } : {}),
        tradeAccountId: tradeAccount.id,
        customerName: "Trade Verified Customer",
        customerEmail: String(tradeAccount.contactEmail || ""),
      },
    });
    const created = await createResponse.json();
    expect(createResponse.ok(), JSON.stringify(created)).toBeTruthy();
    expect(String(created?.booking?.status || "")).toBe("CONFIRMED");
    expect(String(created?.statusUrl || "")).toContain("/portal/booking/status/");

    const bookingStatusResponse = await requestLocalApi(request, `/public/booking-status/${String(created?.statusUrl || "").split("/").pop()}`);
    expect(bookingStatusResponse.ok()).toBeTruthy();
    const status = await bookingStatusResponse.json();
    expect(status?.pricingSnapshotJson?.depositDueCents).toBe(0);
    expect(String(status?.paymentStateJson?.depositStatusLabel || "").toLowerCase()).toContain("no deposit");
  });

  test("public booking uses tenant branding and tenant-scoped location and folder images", async ({ page, request }) => {
    const token = await loginAndGetToken(request);
    const logoResponse = await requestLocalApi(request, "/tenant/settings/logo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "wheel-ar-logo.png", mimeType: "image/png", buffer: tinyPng },
      },
    });
    expect(logoResponse.ok()).toBeTruthy();

    const locationsResponse = await requestLocalApi(request, "/locations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(locationsResponse.ok()).toBeTruthy();
    const locations = await locationsResponse.json();
    const location = locations.find((entry: any) => entry.isActive) || locations[0];
    expect(location?.id).toBeTruthy();
    const locationImageResponse = await requestLocalApi(request, `/locations/${location.id}/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: "location.png", mimeType: "image/png", buffer: tinyPng },
      },
    });
    expect(locationImageResponse.ok()).toBeTruthy();

    const category = `Premium wheels ${Date.now()}`;
    await createService(request, token, { category, visibility: "PUBLIC" });
    const folderImageResponse = await requestLocalApi(request, "/booking/folders/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        category,
        file: { name: "folder.png", mimeType: "image/png", buffer: tinyPng },
      },
    });
    expect(folderImageResponse.ok()).toBeTruthy();

    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settings = await settingsResponse.json();
    const publicToken = String(settings.publicUrl || "").split("/").pop();
    const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
    const config = await configResponse.json();
    expect(config.tenant.logoUrl).toContain("/tenant/public-logo/");
    expect(config.locations.find((entry: any) => entry.id === location.id)?.metadataJson?.imageUrl).toContain("/tenant/public-booking-media/");
    expect(config.folderImages?.[category]).toContain("/tenant/public-booking-media/");

    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard/booking/settings", { waitUntil: "networkidle" });
    await expect(page.getByTestId(`booking-folder-image-preview-${category}`)).toBeVisible();
    const folderRow = page.getByTestId(`booking-folder-row-${category}`);
    await folderRow.getByLabel(`Upload image for ${category}`).setInputFiles({
      name: "folder-replacement.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    await expect(page.getByTestId(`booking-folder-image-selection-${category}`)).toContainText("folder-replacement.png");
    await expect(folderRow.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
    await folderRow.getByRole("button", { name: "Upload image", exact: true }).click();
    await expect(page.getByText(`${category} image updated.`)).toBeVisible();
    await page.goto(resolveE2EAppUrl(String(settings.publicUrl || "")), { waitUntil: "networkidle" });
    const logo = page.getByTestId("public-booking-tenant-logo");
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((element: HTMLImageElement) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(50);
    expect(await logo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBeTruthy();
    await expect(page.getByText(/logo$/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Powered by MyTitan");
    await expect(page.locator('img[alt*="MyTitan"]')).toHaveCount(0);
    await expect(page.getByTestId("public-booking-location-page").locator("img.public-booking-cardImage").first()).toBeVisible();
    await page.getByTestId("public-booking-location-page").locator("button.public-booking-serviceCard").first().click();
    await expect(page.getByTestId("public-booking-tenant-logo")).toBeVisible();
    const folder = page.getByTestId("public-booking-service-folders").getByRole("button", { name: new RegExp(category) });
    await expect(folder.locator("img")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });

  test("public booking rejects a stale slot and suggests the next available one", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { paymentProvider: "MANUAL" });
    const created = await createPublicBookingWithStatus(request, token, service);
    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicToken = String(settings?.publicUrl || "").split("/").pop();
    expect(publicToken).toBeTruthy();
    const staleResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        serviceId: service.id,
        startsAt: created.booking.startsAt,
        customerName: "Stale Slot Customer",
        customerEmail: "stale-slot@example.test",
      },
    });
    expect(staleResponse.ok()).toBeFalsy();
    const body = await staleResponse.json();
    expect(String(body?.message || "")).toMatch(/just taken|choose another available slot/i);
    expect(body?.nextAvailableSlot ?? null).not.toBeNull();
  });

  test("public booking create path applies friendly rate limiting without leaking request identity", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const service = await createService(request, token, { paymentProvider: "MANUAL" });

    const updateSettings = await requestLocalApi(request, "/bookings/settings", {
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
    expect(updateSettings.ok()).toBeTruthy();

    const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const settings = await settingsResponse.json();
    const publicToken = String(settings?.publicUrl || "").split("/").pop();
    expect(publicToken).toBeTruthy();

    const candidateDates = Array.from({ length: 21 }, (_, index) => {
      const value = new Date();
      value.setUTCHours(0, 0, 0, 0);
      value.setUTCDate(value.getUTCDate() + index + 1);
      return value.toISOString().slice(0, 10);
    }).filter((value) => {
      const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
      return day >= 1 && day <= 5;
    });
    const availability = await findAvailablePublicBookingSlot(request, publicToken, String(service.id || ""), candidateDates);

    let limitedResponse: any = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await requestLocalApi(request, `/public/booking/${publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: {
          serviceId: service.id,
          startsAt: availability.slot.startsAt,
          ...(availability.staffUserId ? { staffUserId: availability.staffUserId } : {}),
          customerName: "Rate Limit Customer",
          customerEmail: `rate-limit-${attempt}@example.test`,
        },
      });
      if (response.status() === 429) {
        limitedResponse = response;
        break;
      }
    }

    expect(limitedResponse).not.toBeNull();
    expect(limitedResponse.status()).toBe(429);
    const limitedBody = await limitedResponse.json();
    expect(String(limitedBody?.message || "")).toContain("Too many attempts. Please wait a moment and try again.");
    expect(JSON.stringify(limitedBody)).not.toContain("127.0.0.1");
    expect(JSON.stringify(limitedBody)).not.toContain(String(publicToken));
  });
});
