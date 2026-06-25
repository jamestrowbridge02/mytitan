import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=",
  "base64",
);

async function adminToken(request: any) {
  const response = await requestLocalApi(request, "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      email: fixtureRefs.workspaceAdminEmail,
      password: fixtureRefs.workspaceAdminPassword,
    },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json()).token || "");
}

test.describe("final real-world acceptance", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running final acceptance.");

  test("logo picker reports the selected image and persists the uploaded logo", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/settings?tab=general", { waitUntil: "networkidle" });

    const input = page.getByTestId("tenant-logo-file-input");
    await input.setInputFiles({ name: "wheel-ar-acceptance.png", mimeType: "image/png", buffer: tinyPng });
    await expect(page.getByTestId("tenant-logo-file-name")).toHaveText("wheel-ar-acceptance.png");
    await expect(page.getByTestId("logo-file-selection")).toContainText("wheel-ar-acceptance.png");
    await expect(page.getByRole("button", { name: "Upload logo", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Upload logo", exact: true }).click();
    await expect(page.getByText(/Logo saved: wheel-ar-acceptance.png/)).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    const savedPreview = page.locator('img[alt="Current business logo"]');
    await expect(savedPreview).toBeVisible();
    expect(await savedPreview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  });

  test("theme and company profile are verified by API readback", async ({ request }) => {
    const token = await adminToken(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const currentResponse = await requestLocalApi(request, "/tenant/settings", { headers });
    expect(currentResponse.ok()).toBeTruthy();
    const current = await currentResponse.json();

    try {
      const themeResponse = await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers,
        data: {
          themeMode: "system",
          companyNumber: "E2E-REAL-WORLD-2026",
          registeredBusinessName: "E2E Acceptance Limited",
          businessDisplayJson: {
            ...(current.businessDisplayJson || {}),
            invoices: true,
            statements: true,
            customerPortal: true,
          },
        },
      });
      expect(themeResponse.ok()).toBeTruthy();
      const readback = await requestLocalApi(request, "/tenant/settings", { headers });
      expect(readback.ok()).toBeTruthy();
      const persisted = await readback.json();
      expect(persisted.themeMode).toBe("system");
      expect(persisted.companyNumber).toBe("E2E-REAL-WORLD-2026");
      expect(persisted.registeredBusinessName).toBe("E2E Acceptance Limited");
      expect(persisted.businessDisplayJson.customerPortal).toBe(true);
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers,
        data: {
          themeMode: current.themeMode || "light",
          companyNumber: current.companyNumber || "",
          registeredBusinessName: current.registeredBusinessName || "",
          businessDisplayJson: current.businessDisplayJson || {},
        },
      });
    }
  });

  test("customer payment terms persist and invoice-level override remains available", async ({ request }) => {
    const token = await adminToken(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const customerId = fixtureRefs.portalActiveCustomerId;
    const initialResponse = await requestLocalApi(request, `/customers/${customerId}`, { headers });
    expect(initialResponse.ok()).toBeTruthy();
    const initial = await initialResponse.json();

    try {
      const saved = await requestLocalApi(request, `/customers/${customerId}/payment-terms`, {
        method: "PATCH",
        headers,
        data: { paymentTermsDays: 21 },
      });
      expect(saved.ok()).toBeTruthy();
      expect((await saved.json()).paymentTermsDays).toBe(21);
      const readback = await requestLocalApi(request, `/customers/${customerId}`, { headers });
      expect((await readback.json()).paymentTermsDays).toBe(21);

      const invoiceOverride = await requestLocalApi(request, `/billing/jobs/${fixtureRefs.invoiceReadyJobId}/payment-terms`, {
        method: "PATCH",
        headers,
        data: { paymentTermsDays: 5 },
      });
      expect(invoiceOverride.ok()).toBeTruthy();
      expect((await invoiceOverride.json()).invoicePaymentTermsDays).toBe(5);
    } finally {
      await requestLocalApi(request, `/customers/${customerId}/payment-terms`, {
        method: "PATCH",
        headers,
        data: { paymentTermsDays: initial.paymentTermsDays ?? null },
      });
    }
  });

  test("trade application can be published, submitted, approved, and invited", async ({ request }) => {
    const token = await adminToken(request);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const settingsResponse = await requestLocalApi(request, "/trade-account-applications/settings", { headers });
    expect(settingsResponse.ok()).toBeTruthy();
    const original = await settingsResponse.json();
    const suffix = Date.now();

    try {
      const enabledResponse = await requestLocalApi(request, "/trade-account-applications/settings", {
        method: "PATCH",
        headers,
        data: {
          enabled: true,
          fields: [{ key: "po_number", label: "PO number", type: "text", required: false }],
        },
      });
      expect(enabledResponse.ok()).toBeTruthy();
      const enabled = await enabledResponse.json();
      const publicToken = String(enabled.publicToken || "");
      expect(publicToken).toBeTruthy();

      const submittedResponse = await requestLocalApi(request, `/public/trade/applications/${publicToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: {
          businessName: `Acceptance Trade ${suffix}`,
          contactName: "Acceptance Contact",
          contactEmail: `acceptance.trade.${suffix}@example.test`,
          contactPhone: "+441234567890",
          answers: { po_number: `PO-${suffix}` },
        },
      });
      expect(submittedResponse.ok()).toBeTruthy();

      const listResponse = await requestLocalApi(request, "/trade-account-applications", { headers });
      expect(listResponse.ok()).toBeTruthy();
      const application = (await listResponse.json()).find((row: any) => row.businessName === `Acceptance Trade ${suffix}`);
      expect(application).toBeTruthy();

      const approvedResponse = await requestLocalApi(request, `/trade-account-applications/${application.id}/review`, {
        method: "POST",
        headers,
        data: { status: "APPROVED", sendPortalInvite: true },
      });
      expect(approvedResponse.ok()).toBeTruthy();
      const approved = await approvedResponse.json();
      expect(approved.tradeAccountId).toBeTruthy();
      expect(approved.invite?.inviteUrl).toContain("/trade/portal/");
      expect(approved.invite?.deliveryStatus).toBeTruthy();
    } finally {
      await requestLocalApi(request, "/trade-account-applications/settings", {
        method: "PATCH",
        headers,
        data: {
          enabled: Boolean(original.enabled),
          fields: Array.isArray(original.fieldsJson) ? original.fieldsJson : [],
        },
      });
    }
  });

  test("sidebar icons share one column and Settings renders a cog", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const offsets = await page.locator(".mt-sidebar__item .mt-sidebar__icon").evaluateAll((icons) =>
      icons.map((icon) => Math.round(icon.getBoundingClientRect().left)),
    );
    expect(new Set(offsets).size).toBe(1);
    const settingsIcon = page.locator('a[href="/dashboard/settings"] .mt-sidebar__icon svg');
    await expect(settingsIcon.locator("circle")).toHaveCount(1);
    await expect(settingsIcon.locator("path")).toHaveCount(1);
  });

  test("public checkout uses customer-safe copy and the exact Pay deposit action", async () => {
    const source = await import("fs").then((fs) =>
      fs.readFileSync("/opt/mytitan/app/pages/portal/booking/[...booking].tsx", "utf8"),
    );
    expect(source).toContain('{onlineCheckoutAvailable ? "Pay deposit" : "Confirm booking"}');
    expect(source).toContain("{bookingSubmissionAvailable ? (");
    expect(source).toContain("Your booking is confirmed after payment.");
    expect(source).toContain("Online payment is not available right now. Please contact the business.");
    expect(source).not.toContain("Pay deposit securely");
    expect(source).not.toContain("MyTitan billing Stripe");
    expect(source).not.toContain("Customer payments must use your business Stripe setup");
  });

  test("tenant customer-payment readiness never reports ready without checkout eligibility", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/billing/customer-payment-readiness", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    const stripe = payload.providers.find((provider: any) => provider.provider === "stripe-connect");

    expect(stripe).toBeTruthy();
    if (stripe.readinessState === "ready") {
      expect(stripe.readinessLabel).toBe("Ready to take customer payments");
      expect(stripe.checkoutEligible).toBe(true);
      expect(stripe.liveCapture).toBe(true);
    } else {
      expect(["not_connected", "needs_setup", "needs_attention"]).toContain(stripe.readinessState);
      expect(stripe.checkoutEligible).toBe(false);
      expect(stripe.liveCapture).toBe(false);
    }
    expect(JSON.stringify(payload)).not.toContain("platform_account_required");
    expect(JSON.stringify(payload)).not.toContain("platform_connect_secret_mismatch");
    expect(JSON.stringify(payload)).not.toContain("required_action");
  });

  test("Payments & Invoices uses checkout readiness instead of a stored Connected flag", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/settings/payments", { waitUntil: "networkidle" });

    const stripeCard = page.getByTestId("payments-provider-stripe-customer-payments");
    await expect(stripeCard).toBeVisible();
    const readiness = stripeCard.getByTestId("stripe-customer-payment-readiness");
    await expect(readiness).toBeVisible();
    const text = await stripeCard.innerText();
    if (text.includes("Ready to take customer payments")) {
      expect(text).toContain("Manage Stripe");
    } else {
      expect(text).toMatch(/Needs setup|Needs attention|Not connected/);
      expect(text).not.toMatch(/\bConnected\b/);
    }
  });
});
