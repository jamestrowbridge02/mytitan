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
    await expect(page.getByTestId("integration-workspace-row-sumup")).toHaveCount(0);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
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
    const accountNavigation = page.getByTestId("mytitan-account-navigation");
    await expect(accountNavigation).toContainText("Subscription");
    await expect(accountNavigation).toContainText("Plan");
    await expect(accountNavigation).toContainText("Job packs");
    await expect(accountNavigation).toContainText("MyTitan invoices");
    await expect(accountNavigation).toContainText("MyTitan payment method");
    await expect(accountNavigation).not.toContainText(/customer payments|bank transfer|card terminal|open banking|gocardless|sumup|zettle|worldpay/i);

    await page.goto("/dashboard/billing?section=customer-payments");
    await expect(page).toHaveURL(/\/dashboard\/settings\/payments$/);
    await expect(page.getByRole("heading", { name: "Payments & Invoices", exact: true })).toBeVisible();
    await expect(page.getByTestId("payments-hub")).not.toContainText(/MyTitan billing Stripe|subscription billing/i);
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
