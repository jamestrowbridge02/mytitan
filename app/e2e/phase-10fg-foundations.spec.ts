import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, requestLocalApi } from "./utils";

async function login(request: any) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: {
      email: fixtureRefs.workspaceAdminEmail,
      password: fixtureRefs.workspaceAdminPassword,
    },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json()).token || "");
}

test.describe("Phase 10F/G checkout, global, and vertical foundations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running authenticated foundation tests.");

  test("global tenant defaults save without compliance claims", async ({ request }) => {
    const token = await login(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const updated = await requestLocalApi(request, "/tenant/settings", {
      method: "PUT",
      headers,
      data: {
        tenantCountry: "GB",
        defaultCurrency: "GBP",
        invoiceCurrency: "GBP",
        defaultLocale: "en-GB",
        publicBookingLocale: "en-GB",
        defaultTimezone: "Europe/London",
        phoneCountryCode: "+44",
        taxLabel: "VAT",
        invoiceLegalFooter: "Tax treatment depends on the business and transaction.",
      },
    });
    expect(updated.ok()).toBeTruthy();
    const body = await updated.json();
    expect(body.tenantCountry).toBe("GB");
    expect(body.invoiceCurrency).toBe("GBP");
    expect(body.publicBookingLocale).toBe("en-GB");
    expect(body.phoneCountryCode).toBe("+44");
    expect(body.taxLabel).toBe("VAT");
  });

  test("deposit-required booking fails closed when tenant checkout is unavailable", async ({ request }) => {
    const token = await login(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const currentResponse = await requestLocalApi(request, "/tenant/settings", { headers });
    expect(currentResponse.ok()).toBeTruthy();
    const current = await currentResponse.json();
    const businessConfigJson = current.businessConfigJson || {};

    try {
      const controlsResponse = await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers,
        data: {
          businessConfigJson: {
            ...businessConfigJson,
            portalControls: {
              ...(businessConfigJson.portalControls || {}),
              portalEnabled: true,
              customerBookingEnabled: true,
              depositsRequired: true,
              allowBookingWithoutDeposit: false,
            },
          },
        },
      });
      expect(controlsResponse.ok()).toBeTruthy();

      const bookingSettingsResponse = await requestLocalApi(request, "/bookings/settings", {
        headers,
      });
      expect(bookingSettingsResponse.ok()).toBeTruthy();
      const bookingSettings = await bookingSettingsResponse.json();
      const assignedUserId = bookingSettings.staff?.[0]?.id;
      const serviceResponse = await requestLocalApi(request, "/booking/services", {
        method: "POST",
        headers,
        data: {
          name: `Deposit preflight ${Date.now()}`,
          description: "Deposit readiness preflight",
          durationMinutes: "60",
          priceCents: "10000",
          depositType: "FIXED",
          depositValue: "2500",
          completionPaymentMode: "ON_COMPLETION",
          paymentProvider: "STRIPE",
          visibility: "PUBLIC",
          assignedUserId,
          isActive: true,
        },
      });
      expect(serviceResponse.ok()).toBeTruthy();
      const service = await serviceResponse.json();

      const enabledResponse = await requestLocalApi(request, "/bookings/settings", {
        method: "POST",
        headers,
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
      expect(enabledResponse.ok()).toBeTruthy();
      const publicToken = String((await enabledResponse.json()).publicUrl || "").split("/").pop();
      expect(publicToken).toBeTruthy();

      let startsAt = "";
      for (let offset = 1; offset <= 30 && !startsAt; offset += 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + offset);
        const day = date.getUTCDay();
        if (day === 0 || day === 6) continue;
        const params = new URLSearchParams({
          date: date.toISOString().slice(0, 10),
          serviceId: service.id,
        });
        if (assignedUserId) params.set("staffUserId", assignedUserId);
        const slotsResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?${params}`);
        expect(slotsResponse.ok()).toBeTruthy();
        startsAt = String((await slotsResponse.json()).slots?.[0]?.startsAt || "");
      }
      expect(startsAt).toBeTruthy();

      const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: {
          serviceId: service.id,
          startsAt,
          ...(assignedUserId ? { staffUserId: assignedUserId } : {}),
          customerName: "Deposit Customer",
          customerEmail: "deposit.customer@example.test",
        },
      });
      expect(createResponse.status()).toBe(400);
      const failure = await createResponse.json();
      expect(failure.code).toBe("ONLINE_PAYMENT_UNAVAILABLE");
      expect(JSON.stringify(failure)).not.toContain("MyTitan billing");
      expect(JSON.stringify(failure)).not.toContain("Stripe Connect");
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers,
        data: { businessConfigJson },
      });
    }
  });

  test("staff rota stores shift details and publishes an audited week", async ({ request }) => {
    const token = await login(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const schedulesResponse = await requestLocalApi(
      request,
      `/calendar/schedules?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      { headers },
    );
    expect(schedulesResponse.ok()).toBeTruthy();
    const schedules = await schedulesResponse.json();
    const technicianId = schedules.technicians?.[0]?.id;
    expect(technicianId).toBeTruthy();

    const saved = await requestLocalApi(request, `/calendar/schedules/${technicianId}`, {
      method: "PATCH",
      headers,
      data: {
        weeklyJson: {
          mon: [{
            start: "09:00",
            end: "17:00",
            role: "Front of house",
            venue: "Main venue",
            breakMinutes: 30,
            notes: "Opening shift",
            absence: false,
          }],
        },
      },
    });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).weeklyJson.mon[0]).toMatchObject({
      role: "Front of house",
      venue: "Main venue",
      breakMinutes: 30,
      notes: "Opening shift",
      absence: false,
    });

    const published = await requestLocalApi(request, "/calendar/rota/publish", {
      method: "POST",
      headers,
      data: { weekStart: from.toISOString().slice(0, 10) },
    });
    expect(published.ok()).toBeTruthy();
    expect((await published.json()).publishedAt).toBeTruthy();
  });

  test("restaurant template is presented as readiness, not a POS claim", async ({ request }) => {
    const token = await login(request);
    const response = await requestLocalApi(request, "/trade-packs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const packs = await response.json();
    const restaurant = packs.find((pack: any) => pack.code === "RESTAURANT");
    expect(restaurant).toBeTruthy();
    expect(restaurant.description).toContain("without POS");
    expect(JSON.stringify(restaurant)).not.toContain("full POS");
    expect(restaurant.includes).toContain("Staff rota readiness");
  });
});
