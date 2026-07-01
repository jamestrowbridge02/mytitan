import { expect, test } from "@playwright/test";
import crypto from "crypto";

import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function createCompletedPaymentJob(request: any, token: string, suffix: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      customerName: `Payment Customer ${suffix}`,
      customerEmail: `payment-${suffix}@example.test`,
      serviceName: "Payment continuity check",
      tradeCode: "WHEELS",
      jobType: "Trade",
      laborCents: 12500,
      completeAfterCreate: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("payments hardening", () => {
  test("operator billing page degrades gracefully when Stripe is unavailable", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/dashboard/billing", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "MyTitan Account", exact: true })).toBeVisible();
    await expect(page.getByText(/Checkout and subscription management are unavailable|Billing is unavailable right now|Unavailable right now/i).first()).toBeVisible();
    await expect(page.getByText(/AI usage/i)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("tenant payment requests stay manual when no verified BYOG provider is ready", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const suffix = String(Date.now());
    const job = await createCompletedPaymentJob(request, token, suffix);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    await requestLocalApi(request, "/integrations/byog/stripe-customer-payments", {
      method: "PUT",
      headers,
      data: {
        scope: "workspace",
        status: "DISABLED",
      },
    });

    const readiness = await requestLocalApi(request, "/billing/customer-payment-readiness", { headers });
    expect(readiness.ok()).toBeTruthy();
    const readinessJson = await readiness.json();
    expect(readinessJson.separation.fallback).toBe("never_fallback_to_mytitan_stripe");
    expect(readinessJson.providers.find((provider: any) => provider.provider === "manual")?.ready).toBe(true);

    const requestResponse = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, {
      method: "POST",
      headers,
      data: { send: true },
    });
    expect(requestResponse.ok()).toBeTruthy();
    const payload = await requestResponse.json();
    expect(payload.request.status).toBe("manual_pending");
    expect(payload.request.provider).toBe("manual");
    expect(JSON.stringify(payload)).not.toContain("sk_");
    expect(JSON.stringify(payload)).not.toContain("whsec_");
    expect(JSON.stringify(payload)).not.toContain("paymentCheckoutSessionId");

    const duplicateRequest = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, {
      method: "POST",
      headers,
      data: { send: true },
    });
    expect(duplicateRequest.ok()).toBeTruthy();
    const duplicatePayload = await duplicateRequest.json();
    expect(duplicatePayload.request.id).toBe(payload.request.id);
    expect(duplicatePayload.duplicatePrevented).toBe(true);

    const setupNeeded = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, {
      method: "POST",
      headers,
      data: { provider: "stripe-connect", send: true },
    });
    expect(setupNeeded.ok()).toBeTruthy();
    const setupPayload = await setupNeeded.json();
    expect(["provider_unavailable", "manual_pending"]).toContain(setupPayload.request.status);
    expect(setupPayload.request.actionUrl).toBeNull();
    expect(JSON.stringify(setupPayload)).not.toContain("MyTitan Stripe");
  });

  test("tenant-owned provider requests require verified webhook events before paid state", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const suffix = String(Date.now());
    const job = await createCompletedPaymentJob(request, token, suffix);
    const webhookSecret = `tenant-webhook-${suffix}`;

    try {
      const saveProvider = await requestLocalApi(request, "/integrations/byog/stripe-customer-payments", {
        method: "PUT",
        headers,
        data: {
          scope: "workspace",
          status: "CONNECTED",
          secretMaterial: webhookSecret,
          credentials: { accountLabel: "Tenant-owned Stripe test", connectedAccountId: "acct_testTenantOwned123" },
        },
      });
      expect(saveProvider.ok()).toBeTruthy();
      const providerRow = await saveProvider.json();

      const verifyReadiness = await requestLocalApi(request, "/billing/customer-payment-readiness/stripe-connect/verify", {
        method: "POST",
        headers,
        data: {},
      });
      expect(verifyReadiness.ok()).toBeTruthy();
      const verifyPayload = await verifyReadiness.json();
      expect(["ready", "needs_attention", "error"]).toContain(verifyPayload.state);
      expect(verifyPayload.state).not.toBe("feature_disabled");
      expect(verifyPayload.mode).toBe("live");
      expect(verifyPayload.liveMutation).toBe(false);
      expect(JSON.stringify(verifyPayload)).not.toContain("acct_testTenantOwned123");
      expect(JSON.stringify(verifyPayload)).not.toContain(webhookSecret);

      const checkoutTest = await requestLocalApi(request, "/billing/customer-payment-readiness/stripe-connect/test", {
        method: "POST",
        headers,
        data: {},
      });
      expect(checkoutTest.ok()).toBeTruthy();
      const checkoutTestPayload = await checkoutTest.json();
      expect(checkoutTestPayload.dryRun).toBe(true);
      expect(checkoutTestPayload.liveMutation).toBe(false);
      expect(["ready", "needs_attention"]).toContain(checkoutTestPayload.state);
      expect(checkoutTestPayload.actionUrl).toBeUndefined();
      expect(JSON.stringify(checkoutTestPayload)).not.toContain("acct_testTenantOwned123");
      expect(JSON.stringify(checkoutTestPayload)).not.toContain(webhookSecret);

      const paymentRequest = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, {
        method: "POST",
        headers,
        data: { provider: "stripe-connect", send: true },
      });
      expect(paymentRequest.ok()).toBeTruthy();
      const paymentPayload = await paymentRequest.json();
      expect(paymentPayload.request.provider).toBe("stripe-connect");
      expect(paymentPayload.request.status).toBe("provider_unavailable");
      expect(paymentPayload.request.actionUrl).toBeNull();
      expect(JSON.stringify(paymentPayload)).not.toContain(webhookSecret);
      expect(JSON.stringify(paymentPayload)).not.toContain("sk_");

      const invalidWebhook = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/billing/customer-payments/webhook/stripe-customer-payments/${providerRow.routeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=invalid`,
        },
        data: JSON.stringify({ id: `evt_invalid_${suffix}`, type: "payment.succeeded" }),
        failOnStatusCode: false,
      });
      expect(invalidWebhook.status()).toBe(403);

      const eventBody = JSON.stringify({
        id: `evt_paid_${suffix}`,
        type: "payment.succeeded",
        paymentRequestId: paymentPayload.request.id,
        status: "paid",
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${eventBody}`).digest("hex");
      const accepted = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/billing/customer-payments/webhook/stripe-customer-payments/${providerRow.routeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": `t=${timestamp},v1=${signature}`,
        },
        data: eventBody,
        failOnStatusCode: false,
      });
      expect(accepted.status()).toBe(202);
      const acceptedJson = await accepted.json();
      expect(acceptedJson.received).toBe(true);

      const duplicate = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/billing/customer-payments/webhook/stripe-customer-payments/${providerRow.routeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": `t=${timestamp},v1=${signature}`,
        },
        data: eventBody,
        failOnStatusCode: false,
      });
      expect(duplicate.status()).toBe(202);
      expect((await duplicate.json()).duplicate).toBe(true);

      const refreshed = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, { headers });
      expect(refreshed.ok()).toBeTruthy();
      const refreshedJson = await refreshed.json();
      expect(refreshedJson.request.status).toBe("paid");
      expect(refreshedJson.job.invoicePaidAt).toBeTruthy();
    } finally {
      await requestLocalApi(request, "/integrations/byog/stripe-customer-payments", {
        method: "PUT",
        headers,
        data: {
          scope: "workspace",
          status: "DISABLED",
        },
      });
    }
  });

  test("manual collection supports partial payment, review, and finance reconciliation without Stripe fallback", async ({ page, request }) => {
    await installApiProxy(page, request);
    const adminToken = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const suffix = String(Date.now());
    const job = await createCompletedPaymentJob(request, adminToken, `manual-${suffix}`);
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

    const paymentRequest = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request`, {
      method: "POST",
      headers: adminHeaders,
      data: { provider: "manual", send: true },
    });
    expect(paymentRequest.ok()).toBeTruthy();
    const paymentPayload = await paymentRequest.json();
    expect(paymentPayload.request.provider).toBe("manual");
    expect(paymentPayload.request.actionUrl).toBeNull();

    const financeToken = await loginAs(page, request, fixtureRefs.financeEmail, fixtureRefs.financePassword);
    const financeHeaders = { Authorization: `Bearer ${financeToken}`, "Content-Type": "application/json" };
    const evidenceUpload = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/artifacts/entities/job/${job.id}/upload`, {
      headers: { Authorization: `Bearer ${financeToken}` },
      multipart: {
        kind: "PORTAL_DOCUMENT",
        label: "Bank transfer evidence",
        portalVisible: "true",
        file: {
          name: `bank-evidence-${suffix}.txt`,
          mimeType: "text/plain",
          buffer: Buffer.from("Safe bank transfer evidence fixture.", "utf8"),
        },
      },
    });
    expect(evidenceUpload.ok()).toBeTruthy();
    const evidenceJson = await evidenceUpload.json();
    expect(evidenceJson.portalVisible).toBe(true);
    expect(JSON.stringify(evidenceJson)).not.toContain("private");

    const partial = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request/${paymentPayload.request.id}/manual-paid`, {
      method: "POST",
      headers: financeHeaders,
      data: {
        method: "bank_transfer",
        reference: `BANK-${suffix}`,
        amountReceivedCents: 5000,
        evidenceArtifactId: evidenceJson.id,
        internalNote: "Finance checked bank feed.",
        customerReceiptNote: "Thanks, your part payment has been received.",
      },
    });
    expect(partial.ok()).toBeTruthy();
    const partialJson = await partial.json();
    expect(partialJson.request.status).toBe("partial_manual");
    expect(partialJson.request.manualMethod).toBe("bank_transfer");
    expect(partialJson.request.amountReceivedCents).toBe(5000);
    expect(partialJson.request.separation.myTitanStripe).toBe("not_used_for_customer_money");
    expect(JSON.stringify(partialJson)).not.toContain("sk_");
    expect(JSON.stringify(partialJson)).not.toContain("whsec_");

    const report = await requestLocalApi(request, "/billing/finance-report", { headers: financeHeaders });
    expect(report.ok()).toBeTruthy();
    const reportJson = await report.json();
    const queueItem = (reportJson.reconciliationQueue || []).find((item: any) => item.paymentRequestId === paymentPayload.request.id);
    expect(queueItem).toBeTruthy();
    expect(queueItem.status).toBe("partial_manual");
    expect(queueItem.evidenceAttached).toBe(true);
    expect(reportJson.summary.manualReviewCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(reportJson)).not.toContain("/uploads/");

    const reviewed = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request/${paymentPayload.request.id}/review`, {
      method: "POST",
      headers: financeHeaders,
      data: { note: "Matched to bank feed" },
    });
    expect(reviewed.ok()).toBeTruthy();
    expect((await reviewed.json()).request.reviewedAt).toBeTruthy();

    const viewerToken = await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    const viewerDenied = await requestLocalApi(request, `/billing/jobs/${job.id}/payment-request/${paymentPayload.request.id}/manual-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
      data: { method: "cash", amountReceivedCents: 12500 },
    });
    expect([403, 404]).toContain(viewerDenied.status());
  });

  test("tenant billing routes choose plan and manage plan actions through the existing billing endpoints", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.route("**/api/billing/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: { code: "SOLE_TRADER", name: "Sole Trader" },
          subscription: { status: "trialing", cancelAtPeriodEnd: false },
          trial: { isActive: true, status: "active", daysRemaining: 10 },
          interval: "MONTHLY",
          stripeConfigured: true,
          pricingModel: {
            tiers: [
              {
                code: "FREE",
                publicName: "Free",
                summary: "Free entry tier",
                idealFor: "Trying the workflow",
                checkoutMode: "signup_only",
                priceMonthlyLabel: "Free",
                priceAnnualLabel: "Free",
                completedJobsLabel: "Up to 20 job completions/month",
                extraJobCompletionPacks: {
                  status: "coming_soon",
                  message: "10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.",
                },
                includedGroups: [{ key: "core", label: "Core workflow" }],
                naturalUpgradeTriggers: [{ key: "volume", label: "More jobs each month" }],
              },
              {
                code: "SOLE_TRADER",
                publicName: "Sole Trader",
                summary: "Current plan",
                idealFor: "Solo operators",
                checkoutMode: "stripe_checkout",
                priceMonthlyLabel: "£19.00 per month",
                priceAnnualLabel: "£190.00 per year, billed annually",
                completedJobsLabel: "Up to 60 job completions/month",
                extraJobCompletionPacks: {
                  status: "coming_soon",
                  message: "10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.",
                },
                includedGroups: [{ key: "core", label: "Core workflow" }],
                naturalUpgradeTriggers: [{ key: "team", label: "More team members" }],
              },
              {
                code: "BUSINESS",
                publicName: "Business",
                summary: "Next plan",
                idealFor: "Growing teams",
                checkoutMode: "stripe_checkout",
                priceMonthlyLabel: "£59.00 per month",
                priceAnnualLabel: "£590.00 per year, billed annually",
                completedJobsLabel: "Up to 200 job completions/month",
                extraJobCompletionPacks: {
                  status: "coming_soon",
                  message: "10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.",
                },
                includedGroups: [{ key: "growth", label: "Growth workflow" }],
                naturalUpgradeTriggers: [{ key: "volume", label: "More jobs each month" }],
              },
            ],
            usageTracking: {
              authoritative: true,
              message: "Included allowance is tracked live. Extra pack allowance only lands after confirmed Stripe webhook events.",
            },
          },
          jobCompletionAllowance: {
            periodStart: "2026-05-01T00:00:00.000Z",
            periodEnd: "2026-06-01T00:00:00.000Z",
            completedJobsCount: 14,
            includedAllowance: 60,
            includedRemaining: 46,
            purchasedExtraAllowance: 0,
            pendingExtraAllowance: 0,
            remainingAllowance: 46,
            extraRemaining: 0,
            expiredPurchases: 0,
            cancelledPurchases: 0,
            pendingPurchases: [],
          },
          viewer: {
            role: "OWNER",
            emailVerified: true,
            canManageSubscription: true,
          },
        }),
      });
    });

    await page.route("**/api/billing/checkout-session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/dashboard/billing?checkout=success" }),
      });
    });

    await page.route("**/api/billing/portal", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/dashboard/billing?portal=opened" }),
      });
    });

    await page.goto("/dashboard/billing");
    await expect(page.getByTestId("billing-free-signup-FREE")).toBeVisible();
    await expect(page.getByText("Up to 20 job completions/month").first()).toBeVisible();
    await page.getByRole("button", { name: "Annual" }).click();
    await expect(page.getByText("£190.00 per year, billed annually").first()).toBeVisible();
    const manageButton = page.locator('[data-testid^="billing-manage-plan-"]').first();
    await expect(manageButton).toBeVisible();
    await expect(page.getByTestId("billing-plan-completion-allowance")).toContainText("Up to 60 job completions/month");
    await expect(page.getByTestId("billing-plan-usage-tracking")).toContainText(/Included allowance is tracked live/i);
    await expect(page.getByTestId("billing-extra-job-packs")).toContainText(/£5, £12\.50, £25, £50, £125, and £250/i);
    await manageButton.click();
    await page.waitForURL(/\/dashboard\/billing\?portal=opened$/);

    await page.goto("/dashboard/billing");
    const chooseButton = page.locator('[data-testid^="billing-choose-plan-"]').first();
    await expect(chooseButton).toBeVisible();
    await chooseButton.click();
    await page.waitForURL(/\/dashboard\/billing\?checkout=success$/);
  });

  test("tenant billing keeps non-owner users informed without exposing billing actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.route("**/api/billing/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: { code: "SOLE_TRADER", name: "Sole Trader" },
          subscription: { status: "trialing", cancelAtPeriodEnd: false },
          trial: { isActive: true, status: "active", daysRemaining: 9 },
          interval: "MONTHLY",
          stripeConfigured: true,
          pricingModel: {
            tiers: [
              {
                code: "FREE",
                publicName: "Free",
                summary: "Free entry tier",
                idealFor: "Trying the workflow",
                checkoutMode: "signup_only",
                priceMonthlyLabel: "Free",
                priceAnnualLabel: "Free",
                completedJobsLabel: "Up to 20 job completions/month",
                extraJobCompletionPacks: {
                  status: "coming_soon",
                  message: "10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.",
                },
                includedGroups: [{ key: "core", label: "Core workflow" }],
                naturalUpgradeTriggers: [{ key: "volume", label: "More jobs each month" }],
              },
              {
                code: "SOLE_TRADER",
                publicName: "Sole Trader",
                summary: "Current plan",
                idealFor: "Solo operators",
                checkoutMode: "stripe_checkout",
                priceMonthlyLabel: "£19.00 per month",
                priceAnnualLabel: "£190.00 per year, billed annually",
                completedJobsLabel: "Up to 60 job completions/month",
                extraJobCompletionPacks: {
                  status: "coming_soon",
                  message: "10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.",
                },
                includedGroups: [{ key: "core", label: "Core workflow" }],
                naturalUpgradeTriggers: [{ key: "team", label: "More team members" }],
              },
            ],
            usageTracking: {
              authoritative: true,
              message: "Included allowance is tracked live. Extra pack allowance only lands after confirmed Stripe webhook events.",
            },
          },
          jobCompletionAllowance: {
            periodStart: "2026-05-01T00:00:00.000Z",
            periodEnd: "2026-06-01T00:00:00.000Z",
            completedJobsCount: 14,
            includedAllowance: 60,
            includedRemaining: 46,
            purchasedExtraAllowance: 0,
            pendingExtraAllowance: 0,
            remainingAllowance: 46,
            extraRemaining: 0,
            expiredPurchases: 0,
            cancelledPurchases: 0,
            pendingPurchases: [],
          },
          viewer: {
            role: "STAFF",
            emailVerified: true,
            canManageSubscription: false,
          },
        }),
      });
    });

    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
    await expect(page.getByText(/workspace owner action required/i).first()).toBeVisible();
    await expect(page.getByText(/only the workspace owner can change the subscription/i).first()).toBeVisible();
    await expect(page.locator('[data-testid^="billing-manage-plan-"]').first()).toContainText(/owner action required/i);
    await expect(page.getByTestId("billing-extra-job-packs")).toContainText(/£5, £12\.50, £25, £50, £125, and £250/i);
  });

  test("payments hub shows tenant payment options without exposing secret-bearing values", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/settings/payments", { waitUntil: "networkidle" });
    await expect(page.getByTestId("payments-hub")).toBeVisible();
    await expect(page.getByTestId("payments-provider-bank-transfer")).toBeVisible();
    await expect(page.getByTestId("payments-provider-manual-card-terminal")).toBeVisible();
    await expect(page.getByText(/Coming soon/i)).toHaveCount(0);
    await expect(page.getByText(/sk_(test|live)_|pk_(test|live)_/)).toHaveCount(0);
  });

  test("billing shows synced job-completion pack readiness without exposing Stripe secrets or pretending checkout is live", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.route("**/api/billing/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: { code: "SOLE_TRADER", name: "Sole Trader", completedJobsLabel: "Up to 60 job completions/month" },
          subscription: { status: "active", cancelAtPeriodEnd: false },
          trial: { isActive: false, status: "converted", daysRemaining: 0 },
          interval: "MONTHLY",
          stripeConfigured: true,
          pricingModel: {
            tiers: [],
            subscriptionPricingReadiness: {
              status: "mismatch",
              message: "One or more Stripe subscription prices do not match the public plan values.",
              checkedAt: "2026-05-08T19:00:00.000Z",
              prices: [
                {
                  planCode: "SOLE_TRADER",
                  planName: "Sole Trader",
                  interval: "MONTHLY",
                  status: "ready",
                  active: true,
                  displayExpectedPrice: "£19.00",
                  displayObservedPrice: "£19.00",
                  detail: "Configured Stripe price matches the public plan amount, currency, and interval.",
                  action: "No change required."
                },
                {
                  planCode: "BUSINESS",
                  planName: "Business",
                  interval: "ANNUAL",
                  status: "mismatch",
                  active: true,
                  displayExpectedPrice: "£590.00",
                  displayObservedPrice: "£600.00",
                  detail: "Configured Stripe price does not match the expected GBP annual amount.",
                  action: "Create or remap a GBP annual Stripe price for Business at 59000 pence, then update STRIPE_PRICE_BUSINESS_ANNUAL."
                }
              ]
            }
          },
          jobCompletionPacks: {
            key: "job_completion_packs",
            status: "partial",
            checkoutEnabled: false,
            checkoutStatus: "setup_required",
            summary: "Some Stripe add-on products are mapped, but setup is still incomplete before extra completions can be enabled.",
            lastCheckedAt: "2026-05-08T19:00:00.000Z",
            expectedCurrency: "GBP",
            packs: [
              {
                code: "job_completion_pack_1",
                label: "10 extra job completions",
                jobCount: 10,
                status: "ready",
                source: "lookup_key",
                active: true,
                currency: "GBP",
                displayPrice: "£5.00",
                productName: "10 extra job completions",
                message: "Stripe product mapping is ready. Add-on checkout stays blocked until checkout wiring and webhook-backed granting are both enabled.",
              },
              {
                code: "job_completion_pack_2",
                label: "25 extra job completions",
                jobCount: 25,
                status: "job_count_mismatch",
                source: "metadata",
                active: true,
                currency: "GBP",
                displayPrice: "£12.50",
                productName: "25 extra job completions",
                message: "Stripe product mapping exists, but the configured job-count metadata does not match the expected 25 jobs.",
              },
              {
                code: "job_completion_pack_3",
                label: "50 extra job completions",
                jobCount: 50,
                status: "inactive",
                source: "lookup_key",
                active: false,
                currency: "GBP",
                displayPrice: "£25.00",
                productName: "50 extra job completions",
                message: "Stripe product mapping exists, but the product or price is inactive.",
              },
              {
                code: "job_completion_pack_4",
                label: "100 extra job completions",
                jobCount: 100,
                status: "currency_mismatch",
                source: "lookup_key",
                active: true,
                currency: "USD",
                displayPrice: "$50.00",
                productName: "100 extra job completions",
                message: "Stripe product mapping exists, but the price currency does not match GBP.",
              },
              {
                code: "job_completion_pack_5",
                label: "250 extra job completions",
                jobCount: 250,
                status: "missing",
                source: "none",
                active: false,
                currency: null,
                displayPrice: null,
                productName: null,
                message: "Stripe product sync has not been completed for this add-on yet.",
              },
              {
                code: "job_completion_pack_6",
                label: "500 extra job completions",
                jobCount: 500,
                status: "missing",
                source: "none",
                active: false,
                currency: null,
                displayPrice: null,
                productName: null,
                message: "Stripe product sync has not been completed for this add-on yet.",
              },
            ],
          },
          jobCompletionAllowance: {
            periodStart: "2026-05-01T00:00:00.000Z",
            periodEnd: "2026-06-01T00:00:00.000Z",
            resetDate: "2026-06-01T00:00:00.000Z",
            completedJobsCount: 68,
            monthlyIncludedAllowance: 60,
            monthlyIncludedUsed: 60,
            monthlyIncludedRemaining: 0,
            purchasedCreditsTotal: 25,
            purchasedCreditsUsed: 8,
            purchasedCreditsRemaining: 17,
            totalAvailableNow: 17,
            includedAllowance: 60,
            includedRemaining: 0,
            purchasedExtraAllowance: 25,
            pendingExtraAllowance: 10,
            remainingAllowance: 17,
            extraRemaining: 17,
            purchaseStateSummary: "Included monthly allowance resets each month. Purchased pack credits carry over until used or refunded.",
            expiredPurchases: 1,
            cancelledPurchases: 1,
            pendingPurchases: [
              {
                id: "pack_pending_1",
                packCode: "job_completion_pack_1",
                jobCompletionCount: 10,
                amountCents: 500,
                currency: "GBP",
                status: "pending",
                createdAt: "2026-05-08T19:00:00.000Z"
              }
            ],
          },
          viewer: {
            role: "OWNER",
            emailVerified: true,
            canManageSubscription: true,
            canManageCollectionSettings: true,
          },
        }),
      });
    });

    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
    await expect(page.getByTestId("billing-subscription-price-review")).toHaveCount(0);
    await expect(page.getByTestId("billing-job-completion-packs-card")).toContainText(/setup required|partial/i);
    await expect(page.getByTestId("billing-job-pack-summary")).toContainText(/setup is still incomplete/i);
    await expect(page.getByTestId("billing-job-pack-checkout")).toContainText(/not available yet/i);
    await expect(page.getByTestId("billing-job-pack-ledger-readiness")).toContainText(/payment is confirmed/i);
    await expect(page.getByTestId("billing-job-pack-allowance")).toContainText("Monthly included allowance");
    await expect(page.getByTestId("billing-job-pack-allowance")).toContainText("Used this month");
    await expect(page.getByTestId("billing-job-pack-allowance")).toContainText("Purchased credits remaining");
    await expect(page.getByTestId("billing-job-pack-allowance")).toContainText("Next reset date");
    await expect(page.getByTestId("billing-job-pack-allowance")).toContainText(/carry over until used or refunded/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_1")).toContainText("10 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_2")).toContainText("25 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_3")).toContainText("50 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_4")).toContainText("100 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_5")).toContainText("250 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_6")).toContainText("500 jobs");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_1")).toContainText("£5.00");
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_1")).toContainText(/ready/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_2")).toContainText(/mismatch/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_3")).toContainText(/inactive/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_4")).toContainText(/currency mismatch/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_5")).toContainText(/missing/i);
    await expect(page.getByTestId("billing-job-pack-primary-job_completion_pack_6")).toContainText(/missing/i);
    await expect(page.locator("body")).not.toContainText("sk_live_");
    await expect(page.locator("body")).not.toContainText("sk_test_");
    await expect(page.locator("body")).not.toContainText("price_");
  });

  test("MyTitan account and payment collection remain legible on a narrow viewport", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/dashboard/settings/payments", { waitUntil: "networkidle" });
    await expect(page.getByTestId("payments-hub")).toBeVisible();
    await expect(page.getByTestId("payments-provider-bank-transfer")).toBeVisible();
    const paymentsOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(paymentsOverflow).toBeLessThanOrEqual(2);

    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
    await expect(page.getByTestId("billing-trial-card")).toBeVisible();
    await expect(page.getByRole("heading", { name: /MyTitan Account/i })).toBeVisible();
  });

  test("billing readiness route renders without client-side exceptions", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/dashboard/billing/readiness", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByText(/Billing readiness|Billing access restricted/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("public portal payment surface renders without client-side exceptions", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/portal/job/e2e-public-portal-token", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("public-portal-billing-progress")).toBeVisible();
    await expect(page.getByText(/Payment is handled by the business payment setup|Customer payments are handled by the business payment setup|Payment is being handled directly by the team/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
