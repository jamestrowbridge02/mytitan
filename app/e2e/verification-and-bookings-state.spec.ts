import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { cleanupGeneratedWorkspace, defaultOperatorEmail, defaultOperatorPassword, installApiProxy, loginAs } from "./utils";

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return String(token);
}

async function getTenantSettings(request: any, token: string) {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function updateTenantSettings(request: any, token: string, data: Record<string, any>) {
  const response = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getBookingSettings(request: any, token: string) {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/bookings/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function updateBookingSettings(request: any, token: string, data: Record<string, any>) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/bookings/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("verification resend and bookings state", () => {
  test("signup page sells the trial with clear trust signals", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/signup");

    await expect(page.getByRole("heading", { name: "Start your 14-day trial" })).toBeVisible();
    await expect(page.getByText("No card required during setup")).toBeVisible();
    await expect(page.getByText("Reach first value quickly")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
    await expect(page.getByText(/Set the basics/i)).toBeVisible();
    await expect(page.getByText(/Start the first workflow/i)).toBeVisible();
    await expect(page.getByText(/Finish and follow up/i)).toBeVisible();
    await expect(page.getByTestId("signup-region-defaults")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start 14-day trial" })).toBeVisible();
  });

  test("geo defaults endpoint derives safe region and currency defaults without exposing raw IP data", async ({ request }) => {
    const detectedResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/geo-defaults`, {
      headers: { "cf-ipcountry": "US" },
    });
    expect(detectedResponse.ok()).toBeTruthy();
    const detectedBody = await detectedResponse.json();
    expect(detectedBody).toMatchObject({
      countryCode: "US",
      country: "United States",
      currency: "USD",
      locale: "en-US",
    });
    expect(Object.keys(detectedBody)).not.toContain("ip");

    const fallbackResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/geo-defaults`);
    expect(fallbackResponse.ok()).toBeTruthy();
    const fallbackBody = await fallbackResponse.json();
    expect(fallbackBody).toMatchObject({
      countryCode: null,
      currency: "GBP",
      locale: "en-GB",
    });
    expect(Object.keys(fallbackBody)).not.toContain("ip");
  });

  test("signup region defaults auto-fill and manual currency override wins", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.route("**/api/auth/geo-defaults", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "header",
          detected: true,
          confidence: "high",
          countryCode: "US",
          country: "United States",
          region: "United States",
          currency: "USD",
          locale: "en-US",
          timezone: "UTC",
        }),
      });
    });

    await page.goto("/signup");

    await expect(page.getByTestId("signup-country-select")).toHaveValue("US");
    await expect(page.getByTestId("signup-currency-input")).toHaveValue("USD");
    await page.getByTestId("signup-currency-input").fill("GBP");
    await page.getByTestId("signup-country-select").selectOption("IE");
    await expect(page.getByTestId("signup-currency-input")).toHaveValue("GBP");
  });

  test("signup uses GBP fallback when geo detection is unavailable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.route("**/api/auth/geo-defaults", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "unavailable" }),
      });
    });

    await page.goto("/signup");

    await expect(page.getByTestId("signup-country-select")).toHaveValue("");
    await expect(page.getByTestId("signup-currency-input")).toHaveValue("GBP");
  });

  test("signup resend shows admin-safe email setup guidance instead of an internal error", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/signup");

    const uniqueId = Date.now();
    await page.getByLabel("Company name").fill(`Playwright Verify ${uniqueId}`);
    await page.getByLabel("Work email").fill(`verify-${uniqueId}@mytitan.local`);
    await page.getByLabel("Password").fill("MyTitanVerify!2026");
    await page.getByRole("button", { name: "Start 14-day trial" }).click();

    await expect(page.getByRole("button", { name: "Resend verification" })).toBeVisible();
    await expect(
      page.getByText(/check your email to verify your address|mytitan email is not set up yet|mytitan cannot send the verification email just now|this address cannot receive live verification email/i).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resend verification" }).click();

    const notSetUpMessage = page.getByText("MyTitan email is not set up yet. Configure Email Provider in Platform Admin Infrastructure.");
    const unavailableMessage = page.getByText("MyTitan cannot send verification emails right now. Try again shortly.");
    const suppressedMessage = page.getByText("This address cannot receive live verification email from this environment.");
    const sentMessage = page.getByText("Verification email sent from MyTitan. Check your inbox for the new link.");
    const openSettingsLink = page.getByRole("link", { name: "Open email settings" });
    await expect(notSetUpMessage.or(unavailableMessage).or(suppressedMessage).or(sentMessage)).toBeVisible();
    await expect(openSettingsLink).toHaveCount(0);
    await expect(page.getByText("Internal server error")).toHaveCount(0);

    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    await cleanupGeneratedWorkspace(request, String(token));
  });

  test("authenticated resend handles already verified users cleanly", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);

    const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/resend-verification`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({
      status: "already_verified",
      message: expect.stringMatching(/already verified/i),
    });
  });

  test("public verification resend keeps auth mail on the MyTitan-owned path", async ({ request }) => {
    const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/resend-verification/public`, {
      headers: { "Content-Type": "application/json" },
      data: {
        email: `verify-public-${Date.now()}@example.test`,
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(String(body?.message || "")).not.toMatch(/workspace admin|add your sending email in settings|customer email is not set up/i);
    expect(body?.actionHref ?? null).toBeNull();
  });

  test("system and workspace email readiness stay separate", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);

    const [workspaceResponse, systemResponse] = await Promise.all([
      request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings/email-readiness`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings/email-readiness?ownership=system`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    expect(workspaceResponse.ok()).toBeTruthy();
    expect(systemResponse.ok()).toBeTruthy();

    const workspace = await workspaceResponse.json();
    const system = await systemResponse.json();
    expect(String(workspace?.workspace?.guidance || "")).toMatch(/optional custom sending domain|mytitan delivery/i);
    expect(String(system?.guidance || "")).not.toMatch(/customer email is not set up yet|add your sending email in settings/i);
    expect(String(system?.guidance || "")).not.toMatch(/add your sending email in settings/i);
    expect(workspace?.workspace?.fromEmail ?? null).toBeNull();
    expect(typeof workspace?.effective?.canSend).toBe("boolean");
    if (system?.canSend) {
      expect(String(system?.status || "")).toBe("ready");
      expect(system?.fromEmail ?? null).not.toBeNull();
      expect(system?.fromName ?? null).not.toBeNull();
      if (workspace?.effective?.usingFallback) {
        expect(String(workspace?.effective?.notice || "")).toMatch(/messages are sent securely by mytitan|replies are not yet routed/i);
        expect(String(workspace?.effective?.deliveryPath || "")).toBe("mytitan_service");
        expect(String(workspace?.effective?.fromAddressSource || "")).toBe("mytitan_system_sender");
      }
    } else {
      expect(String(system?.guidance || "")).toMatch(/mytitan email|smtp host|server|configure email provider/i);
      expect(system?.fromEmail ?? null).toBeNull();
      expect(system?.fromName ?? null).toBeNull();
    }
  });

  test("messages settings show outbound email readiness without exposing SMTP secrets", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/settings?tab=messages");
    await expect(page.getByTestId("email-readiness-status")).toBeVisible();
    await expect(page.getByTestId("system-email-readiness-status")).toBeVisible();
    await expect(page.getByTestId("effective-email-readiness-status")).toBeVisible();
    await expect(page.getByText(/smtp_password|smtp_pass/i)).toHaveCount(0);
  });

  test("messages settings show MyTitan delivery as the default customer email path", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.route("**/api/tenant/settings/email-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspace: {
            status: "not_configured",
            source: "missing",
            transport: "none",
            canSend: false,
            fromEmail: null,
            fromName: "Wheel A&R",
            replyToEmail: "hello@wheelar.co.uk",
            guidance: "Optional custom sending domain is not configured. MyTitan delivery can still send customer email.",
            dnsRecords: [],
          },
          fallback: {
            status: "ready",
            source: "environment",
            transport: "smtp",
            canSend: true,
            fromEmail: "system@example.com",
            fromName: "MyTitan",
            replyToEmail: null,
            guidance: "Email delivery is ready.",
            dnsRecords: [],
          },
          effective: {
            status: "ready",
            source: "environment",
            transport: "smtp",
            canSend: true,
            fromEmail: "system@example.com",
            fromName: "Wheel A&R via MyTitan",
            replyToEmail: "hello@wheelar.co.uk",
            replyTo: "hello@wheelar.co.uk",
            replyToSource: "business_email",
            deliveryReady: true,
            deliveryPath: "mytitan_service",
            fromAddressSource: "mytitan_system_sender",
            customSenderConfigured: false,
            customSenderVerified: false,
            systemSenderReady: true,
            effectiveSenderLabel: "Wheel A&R via MyTitan",
            operatorAction: "No action required for basic customer email. Set up a custom sending domain only if you want one.",
            requestId: "email_test123",
            guidance: "Messages are sent securely by MyTitan using your business name. Replies go to your business email.",
            dnsRecords: [],
            senderOwnership: "system",
            usingFallback: true,
            notice: "Messages are sent securely by MyTitan using your business name.",
          },
        }),
      });
    });
    await page.route("**/api/tenant/settings/email-readiness?ownership=system", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          source: "environment",
          transport: "smtp",
          canSend: true,
          fromEmail: "system@example.com",
          fromName: "MyTitan",
          replyToEmail: null,
          guidance: "Email delivery is ready.",
          dnsRecords: [],
        }),
      });
    });

    await page.goto("/dashboard/settings?tab=messages");
    const effectiveCard = page.getByTestId("effective-email-readiness-status");
    await expect(effectiveCard).toContainText(/Customer email:\s*Ready/i);
    await expect(effectiveCard).toContainText(/Wheel A&R via MyTitan/i);
    await expect(effectiveCard).toContainText(/Replies:\s*hello@wheelar.co.uk/i);
    await expect(effectiveCard).toContainText(/Delivery service:\s*MyTitan email service/i);
    await expect(effectiveCard).toContainText(/Custom sending domain:\s*Optional/i);
    await expect(effectiveCard).not.toContainText(/not set up|fallback|workspace sender/i);
  });

  test("settings save categorized internal notification recipients and booking setup links back to settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);

    try {
      await page.goto("/dashboard/settings?tab=messages");
      if (!(await page.getByTestId("internal-recipient-add").isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /Email & Notifications/i }).click();
      }
      await page.getByTestId("internal-recipient-add").click();
      await page.getByTestId("internal-recipient-email-0").fill("ops@example.com");
      await page.getByTestId("internal-recipient-label-0").fill("Ops desk");
      await page.getByTestId("internal-recipient-category-0-payments").check();

      await page.getByTestId("internal-recipient-add").click();
      await page.getByTestId("internal-recipient-email-1").fill("alerts@example.test");
      await page.getByTestId("internal-recipient-label-1").fill("Suppressed");
      await page.getByTestId("internal-recipient-category-1-workspace_alerts").check();

      const saveResponse = page.waitForResponse((response) =>
        response.url().includes("/tenant/settings") && response.request().method() === "PUT",
      );
      await page.getByTestId("settings-save-button").first().click();
      expect((await saveResponse).ok()).toBeTruthy();

      const updatedSettings = await getTenantSettings(request, token);
      expect(updatedSettings?.emailNotificationRecipients).toEqual(
        expect.arrayContaining(["ops@example.com"]),
      );
      expect(updatedSettings?.businessConfigJson?.notificationRouting?.internalRecipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email: "ops@example.com",
            label: "Ops desk",
            enabled: true,
            categories: expect.arrayContaining(["bookings", "payments"]),
          }),
        ]),
      );

      await page.goto("/dashboard/booking/settings");
      await expect(page.getByTestId("booking-confirmations-card")).toContainText(/managed in settings/i);
      await expect(page.getByRole("link", { name: "Open Email settings" })).toBeVisible();
    } finally {
      await updateTenantSettings(request, token, {
        emailNotificationRecipients: currentSettings?.emailNotificationRecipients || [],
        businessConfigJson: currentSettings?.businessConfigJson || {},
      });
    }
  });

  test("bookings page treats legacy workspace flags as available and reports incomplete setup truthfully", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);
    const bookingSettings = await getBookingSettings(request, token);

    try {
      await updateTenantSettings(request, token, {
        bookingsEnabled: true,
        featureBookings: false,
      });
      await updateBookingSettings(request, token, {
        publicEnabled: false,
        businessHours: bookingSettings.businessHours || [],
        blackoutDates: bookingSettings.blackoutDates || [],
      });

      await page.goto("/dashboard/bookings");
      await expect(page.getByRole("heading", { level: 1, name: /Bookings|Requests/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Bookings are ready to set up\./i })).toBeVisible();
      await expect(page.getByText("Bookings are off right now.")).toHaveCount(0);
    } finally {
      await updateTenantSettings(request, token, {
        bookingsEnabled: Boolean(currentSettings?.bookingsEnabled),
        featureBookings: Boolean(currentSettings?.featureBookings),
      });
      await updateBookingSettings(request, token, {
        publicEnabled: Boolean(bookingSettings?.publicEnabled),
        businessHours: bookingSettings?.businessHours || [],
        blackoutDates: bookingSettings?.blackoutDates || [],
      });
    }
  });

  test("bookings page reports no open slots instead of off when legacy workspace flags are disabled", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);
    const bookingSettings = await getBookingSettings(request, token);
    const today = new Date();
    const blackoutDates = Array.from({ length: 14 }, (_, index) => {
      const next = new Date(today);
      next.setUTCDate(next.getUTCDate() + index);
      return { date: next.toISOString().slice(0, 10), reason: "Playwright no-slot coverage" };
    });

    try {
      await updateTenantSettings(request, token, {
        bookingsEnabled: false,
        featureBookings: false,
      });
      await updateBookingSettings(request, token, {
        publicEnabled: true,
        businessHours: bookingSettings.businessHours || [],
        blackoutDates,
      });

      await page.goto("/dashboard/bookings");
      await expect(page.getByRole("heading", { level: 1, name: /Bookings|Requests/ })).toBeVisible();
      await expect(page.getByText("Bookings are live, but there are no open slots right now.").first()).toBeVisible();
      await expect(page.getByText("Bookings are off right now.")).toHaveCount(0);
    } finally {
      await updateTenantSettings(request, token, {
        bookingsEnabled: Boolean(currentSettings?.bookingsEnabled),
        featureBookings: Boolean(currentSettings?.featureBookings),
      });
      await updateBookingSettings(request, token, {
        publicEnabled: Boolean(bookingSettings?.publicEnabled),
        businessHours: bookingSettings?.businessHours || [],
        blackoutDates: bookingSettings?.blackoutDates || [],
      });
    }
  });

  test("google calendar readiness stays available when legacy bookings flags are turned off", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);

    try {
      await updateTenantSettings(request, token, {
        bookingsEnabled: false,
        featureBookings: false,
      });

      await page.goto("/dashboard/integrations");
      const googleRow = page.getByTestId("integration-personal-row-google");
      await expect(googleRow).toContainText("Connected");
      await expect(googleRow).not.toContainText(/module disabled/i);
    } finally {
      await updateTenantSettings(request, token, {
        bookingsEnabled: Boolean(currentSettings?.bookingsEnabled),
        featureBookings: Boolean(currentSettings?.featureBookings),
      });
    }
  });
});
