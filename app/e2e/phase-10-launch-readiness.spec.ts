import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("Phase 10 launch readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running launch-readiness tests.");

  test("external provider credentials stay unverified until provider evidence exists", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    try {
      const saved = await requestLocalApi(request, "/integrations/byog/sumup", {
        method: "PUT",
        headers,
        data: {
          scope: "WORKSPACE",
          status: "CONNECTED",
          credentials: { accountReference: `phase10-${Date.now()}` },
          secretMaterial: "phase10-server-only-secret",
        },
      });
      expect(saved.ok()).toBeTruthy();
      expect(await saved.json()).toMatchObject({
        provider: "sumup",
        status: "setup_needed",
        connected: false,
      });

      const checked = await requestLocalApi(request, "/integrations/byog/sumup/check", {
        method: "POST",
        headers,
      });
      expect(checked.ok()).toBeTruthy();
      expect(await checked.json()).toMatchObject({
        ok: false,
        category: "provider_verification_required",
        liveMutation: false,
      });
    } finally {
      await requestLocalApi(request, "/integrations/byog/sumup", {
        method: "DELETE",
        headers,
      });
    }
  });

  test("validated bank transfer setup is tenant-owned and does not expose account details", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const saved = await requestLocalApi(request, "/integrations/byog/bank-transfer", {
      method: "PUT",
      headers,
      data: {
        scope: "WORKSPACE",
        status: "CONNECTED",
        credentials: {
          accountName: "Phase 10 Services Ltd",
          sortCode: "123456",
          accountNumber: "12345678",
        },
        metadata: { paymentReference: "JOBREF", enabled: true },
      },
    });
    expect(saved.ok()).toBeTruthy();
    const body = await saved.json();
    expect(body).toMatchObject({ provider: "bank-transfer", connected: true });
    expect(JSON.stringify(body)).not.toContain("12345678");
    expect(JSON.stringify(body)).not.toContain("123456");
  });

  test("Connected Tools defaults to a clean grouped directory without tenant diagnostics", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/integrations");

    await expect(page.getByRole("heading", { name: "Connected tools", exact: true })).toBeVisible();
    await expect(page.getByTestId("integrations-workspace-section")).toBeVisible();
    await expect(page.getByTestId("integration-advanced-details")).toHaveCount(0);
    await expect(page.getByTestId("integration-admin-health")).toHaveCount(0);
    await expect(page.getByTestId("integration-workspace-row-sumup")).toContainText("Manual collection");
    await expect(page.getByTestId("integration-workspace-row-quickbooks")).toContainText("API connection");
    await expect(page.getByTestId("integration-workspace-row-sage")).toContainText("File exchange");
    await expect(page.getByTestId("integration-workspace-row-quickbooks")).not.toContainText("Connect QuickBooks");
    await expect(page.getByTestId("integration-workspace-row-sage")).not.toContainText("Connect Sage");
    await expect(page.getByTestId("integration-workspace-row-apple-calendar")).toContainText("Add calendar feed");
    await expect(page.locator("body")).not.toContainText("tokens returned:");
  });

  test("accounting setup routes use the five-step provider wizard", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/settings/integrations/xero");

    await expect(page.getByRole("heading", { name: "Xero", exact: true })).toBeVisible();
    await expect(page.getByTestId("provider-setup-wizard")).toContainText("What this connects");
    await expect(page.getByTestId("provider-setup-wizard")).toContainText("Connect account");
    await expect(page.getByTestId("provider-setup-wizard")).toContainText("Verify connection");
    await expect(page.getByTestId("provider-setup-wizard")).toContainText("Test safely");
    await expect(page.getByTestId("provider-setup-wizard")).toContainText("Complete");
  });

  test("MyTitan Account and customer Payments & Invoices remain separate", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: "MyTitan Account", exact: true })).toBeVisible();
    await expect(page.getByTestId("billing-payment-collection-card")).toHaveCount(0);
    await expect(page.getByTestId("billing-account-summary")).toBeVisible();
    await expect(page.getByTestId("billing-plan-choices-section")).toBeVisible();
    await expect(page.getByTestId("billing-job-completion-packs-card")).toBeVisible();
    await expect(page.getByTestId("billing-payment-method-target")).toBeVisible();
    await expect(page.getByTestId("billing-invoices-section")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/customer payments|bank transfer|card terminal|open banking|gocardless|sumup|zettle|worldpay|webhook-backed|canary/i);

    await page.goto("/dashboard/billing?section=customer-payments");
    await expect(page).toHaveURL(/\/dashboard\/settings\/payments$/);
    await expect(page.getByRole("heading", { name: "Payments & Invoices", exact: true })).toBeVisible();
    await expect(page.getByTestId("payments-hub")).not.toContainText(/MyTitan billing Stripe|subscription billing/i);
    await expect(page.getByTestId("payments-hub")).toContainText("Platform billing is not a customer payment option.");
    await expect(page.getByTestId("payments-provider-stripe-customer-payments")).toContainText("Stripe Connect");
    await expect(page.getByTestId("payments-provider-category-stripe-customer-payments")).toContainText("Tenant-owned account");
    await expect(page.getByTestId("payments-provider-category-bank-transfer")).toContainText("Manual transfer");
    await expect(page.getByTestId("payments-provider-category-manual-card-terminal")).toContainText("External terminal");
    await expect(page.getByTestId("payments-provider-stripe-customer-payments")).toContainText("Connect each business's own Stripe account so customers can pay that business directly.");
    await expect(page.getByTestId("payments-hub")).not.toContainText(/MyTitan Billing Stripe/i);
  });

  test("account billing actions open concrete targets or show unavailable reasons", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

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

    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });

    await expect(page.getByTestId("billing-account-summary")).toBeVisible();
    await page.getByRole("button", { name: "Annual" }).click();
    await expect(page.getByTestId("billing-interval-annual")).toHaveClass(/active/);
    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(page.getByTestId("billing-interval-monthly")).toHaveClass(/active/);

    await expect(page.getByTestId("billing-plan-choices-section")).toBeVisible();
    const planAction = page.locator('[data-testid^="billing-choose-plan-"], [data-testid^="billing-manage-plan-"]').first();
    if (await planAction.count()) {
      await expect(planAction).toContainText(/Select plan|Manage plan|Owner required|Verify email first|Unavailable/i);
    } else {
      await expect(page.getByTestId("billing-plan-unavailable")).toContainText(/Paid plan checkout is not currently available/i);
    }

    await expect(page.getByTestId("billing-job-completion-packs-card")).toBeVisible();
    if (await page.getByTestId("billing-review-plans").count()) {
      await page.getByTestId("billing-review-plans").click();
      await expect(page).toHaveURL(/section=plan-choices/);
      await expect(page.getByTestId("billing-plan-choices-section")).toBeVisible();
    }

    await expect(page.getByTestId("billing-payment-method-target")).toBeVisible();
    if (await page.getByTestId("billing-open-payment-method").count()) {
      await page.getByTestId("billing-open-payment-method").click();
      await page.waitForURL(/\/dashboard\/billing\?portal=opened$/);
      await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
    } else {
      await expect(page.getByTestId("billing-payment-method-target")).toContainText(/Add a payment method when you choose a plan|unavailable|Ask the account owner|Verify the owner email/i);
    }

    await expect(page.getByTestId("billing-invoices-section")).toBeVisible();
    if (await page.getByTestId("billing-open-invoices").count()) {
      await page.getByTestId("billing-open-invoices").click();
      await page.waitForURL(/\/dashboard\/billing\?portal=opened$/);
    } else {
      await expect(page.getByTestId("billing-invoices-section")).toContainText(/No MyTitan invoices yet/i);
    }
    await expect(page.locator("body")).not.toContainText(/Payment provider setup is managed from Settings|webhook-backed|canary|MYTITAN_CONFIRM_JOB_PACK_CHECKOUT/i);
  });

  test("Developer Tools remain hidden from viewer roles", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    await page.goto("/dashboard/integrations");

    await expect(page.getByTestId("developer-tools")).toHaveCount(0);
    await expect(page.getByTestId("integration-api-token-create")).toHaveCount(0);
    await expect(page.getByTestId("integration-webhook-create")).toHaveCount(0);
  });
});
