import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("phase 4C operational workflows", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  async function createService(request: any, token: string) {
    const response = await requestLocalApi(request, "/booking/services", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        name: `Phase 4C Booking Service ${Date.now()}`,
        description: "Location-first booking service",
        durationMinutes: "60",
        priceCents: "14900",
        discountPriceCents: "12900",
        depositType: "FIXED",
        depositValue: "2500",
        completionPaymentMode: "ON_COMPLETION",
        paymentProvider: "MANUAL",
        isActive: true,
      },
    });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    return Array.isArray(payload) ? payload.find((location: any) => location?.isActive !== false) || payload[0] : payload;
  }

  async function ensureLocation(request: any, token: string, existing?: any[]) {
    const current = Array.isArray(existing) ? existing.find((location: any) => location?.isActive !== false) || existing[0] : null;
    if (current?.id) return current;
    const response = await requestLocalApi(request, "/locations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        name: `Phase 4C Branch ${Date.now()}`,
        kind: "BRANCH",
        city: "Leeds",
        country: "GB",
        timezone: "UTC",
        isActive: true,
        bookingLeadTimeMins: 0,
      },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  test("booking stays location-first and auto-populates the job sheet without a technician", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const settings = await (await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const locations = await (await requestLocalApi(request, "/locations", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const service = await createService(request, token);
    const location = await ensureLocation(request, token, locations);
    expect(service?.id).toBeTruthy();
    expect(location?.id).toBeTruthy();

    await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        autoAssignWorkflow: false,
        locationFirstScheduling: true,
        autoCreateJobFromBooking: true,
        autoPopulateJobSheetFromBooking: true,
        technicianAssignmentRequired: false,
      },
    });

    const startsAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(10, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const createResponse = await requestLocalApi(request, "/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        locationId: location.id,
        serviceId: service.id,
        customerName: "Phase 4C Location First",
        customerEmail: "phase4c-location@example.test",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const booking = await createResponse.json();
    expect(booking.locationId).toBe(location.id);
    expect(booking.assignedUserId).toBeFalsy();

    const convertResponse = await requestLocalApi(request, `/bookings/${booking.id}/convert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(convertResponse.ok()).toBeTruthy();
    const conversion = await convertResponse.json();
    expect(conversion.job.assignedUserId).toBeFalsy();
    expect(conversion.job.locationId).toBe(location.id);
    expect(conversion.job.formData.autoPopulatedFromBooking).toBe(true);
    expect(conversion.job.formData.sourceBookingId).toBe(booking.id);
    expect(conversion.job.formData.bookingServiceLines.length).toBeGreaterThanOrEqual(1);
    expect(conversion.conversion.dispatchFollowUpCreated).toBe(true);
  });

  test("invoice issue records draft-first source metadata from completed job data", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const response = await requestLocalApi(request, "/billing/jobs/e2e-job-invoice-ready/issue-invoice", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const job = await response.json();
    expect(job.status).toBe("INVOICED");
    expect(job.invoicePaidAt).toBeFalsy();
    expect(job.formData.invoiceAutoPopulation.source).toBe("completed_job");
    expect(job.formData.invoiceAutoPopulation.draftFirst).toBe(true);
    expect(job.formData.invoiceAutoPopulation.paymentState).toBe("not_paid");
  });

  test("account health autofixes safe tenant data and leaves unsafe billing fixes manual", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const current = await (await requestLocalApi(request, "/tenant/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();

    try {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          emailNotificationRecipients: [],
          businessConfigJson: {
            ...(current.businessConfigJson || {}),
            portalControls: null,
          },
        },
      });

      const healthResponse = await requestLocalApi(request, "/tenant/account-health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(healthResponse.ok()).toBeTruthy();
      const health = await healthResponse.json();
      expect(health.platformDiagnosticsVisible).toBe(false);
      expect(health.issues.map((issue: any) => issue.key)).toContain("portal_controls_safe_defaults");
      expect(health.issues.find((issue: any) => issue.key === "billing_contact_missing")?.autoFixAvailable).toBe(false);

      const fixResponse = await requestLocalApi(request, "/tenant/account-health/portal_controls_safe_defaults/fix", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(fixResponse.ok()).toBeTruthy();
      const fixedSettings = await (await requestLocalApi(request, "/tenant/settings", {
        headers: { Authorization: `Bearer ${token}` },
      })).json();
      expect(fixedSettings.businessConfigJson.portalControls.customerBookingEnabled).toBe(true);
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          emailReplyTo: current.emailReplyTo || "",
          emailNotificationRecipients: current.emailNotificationRecipients || [],
          businessConfigJson: current.businessConfigJson || {},
        },
      });
    }
  });

  test("portal controls disable public booking and allow no-deposit booking when enabled", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const currentSettings = await (await requestLocalApi(request, "/tenant/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const bookingSettings = await (await requestLocalApi(request, "/bookings/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const publicToken = String(bookingSettings.publicUrl || "").split("/").pop();
    expect(publicToken).toBeTruthy();

    try {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          businessConfigJson: {
            ...(currentSettings.businessConfigJson || {}),
            portalControls: {
              portalEnabled: true,
              customerBookingEnabled: false,
              depositsRequired: false,
              allowBookingWithoutDeposit: true,
              displayEtaWindow: false,
              displayBeforeAfterPhotos: false,
              displayInvoicesPayments: false,
              allowCustomerDocumentDownload: false,
              customerContactMessage: "Please call the office to book.",
            },
          },
          featureCustomerPortal: true,
          bookingPublicEnabled: true,
        },
      });
      const disabledResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
      expect(disabledResponse.status()).toBe(400);
      expect(await disabledResponse.text()).toContain("Please call the office to book.");

      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          businessConfigJson: {
            ...(currentSettings.businessConfigJson || {}),
            portalControls: {
              portalEnabled: true,
              customerBookingEnabled: true,
              depositsRequired: false,
              allowBookingWithoutDeposit: true,
              displayEtaWindow: false,
              displayBeforeAfterPhotos: false,
              displayInvoicesPayments: false,
              allowCustomerDocumentDownload: false,
            },
          },
          featureCustomerPortal: true,
          bookingPublicEnabled: true,
        },
      });
      const configResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
      expect(configResponse.ok()).toBeTruthy();
      const config = await configResponse.json();
      expect(config.portalControls.allowBookingWithoutDeposit).toBe(true);
      expect(config.portalControls.displayInvoicesPayments).toBe(false);
      expect(config.services[0].depositDueCents || 0).toBe(0);
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          businessConfigJson: currentSettings.businessConfigJson || {},
          featureCustomerPortal: currentSettings.featureCustomerPortal,
          bookingPublicEnabled: currentSettings.bookingPublicEnabled,
        },
      });
    }
  });
});
