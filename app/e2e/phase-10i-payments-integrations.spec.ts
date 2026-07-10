import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("Phase 10I payments and integrations launch UX", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running Phase 10I coverage.");

  test.beforeEach(async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
  });

  test("Connected Tools is a grouped action-first directory without tenant diagnostics", async ({ page }) => {
    await page.goto("/dashboard/integrations", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Connected tools", exact: true })).toBeVisible();
    for (const group of ["Payments", "Accounting", "Calendar", "Communications", "Maps", "Storage", "Automation", "Identity", "Developer Tools"]) {
      await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("connected-tools-group-communications")).toContainText(/Twilio SMS|WhatsApp Business/i);
    await expect(page.getByTestId("connected-tools-group-maps")).toContainText(/Provider-neutral directions|Google Maps|Requires external account/i);
    await expect(page.getByTestId("connected-tools-group-storage")).toContainText(/OneDrive|Google Drive|Dropbox|Not implemented/i);
    await expect(page.getByTestId("connected-tools-group-automation")).toContainText(/Zapier|Make|n8n/i);
    await expect(page.getByTestId("connected-tools-group-identity")).toContainText(/Google sign-in|Microsoft Entra ID|SAML/i);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/OAuth verified|tokens returned|explicit live flag|live provider mutation|idempotency|metadata.only|deployment setup needed|provider mutation/i);
    await expect(page.getByTestId("integration-admin-health")).toHaveCount(0);
    await expect(page.getByTestId("sync-control-room")).toHaveCount(0);
    await expect(page.getByTestId("integration-api-token-create")).toHaveCount(0);
    await expect(page.getByTestId("integration-webhook-create")).toHaveCount(0);
  });

  test("Stripe never shows Ready unless checkout is eligible and Fix opens the guided setup", async ({ page }) => {
    await page.goto("/dashboard/integrations", { waitUntil: "networkidle" });
    const stripeCard = page.getByTestId("integration-workspace-row-stripe");
    await expect(stripeCard).toBeVisible();
    const text = await stripeCard.innerText();
    if (text.includes("Connected")) {
      expect(text).toContain("Customers can pay deposits online.");
      expect(text).toContain("Manage Stripe");
    } else {
      expect(text).toMatch(/Setup required|Needs attention/);
      expect(text).toContain("Fix Stripe setup");
    }

    await stripeCard.getByRole("link").click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/payments\/stripe$/);
    await expect(page.getByTestId("stripe-onboarding-wizard")).toBeVisible();
    await expect(page.getByTestId("stripe-onboarding-wizard")).toContainText(
      "Connect your own Stripe account so customers can pay deposits and invoices directly to your business.",
    );
    await expect(page.getByTestId("stripe-setup-flow")).toContainText("1. Choose payment method");
    await expect(page.getByTestId("stripe-setup-flow")).toContainText("2. Connect or enter details");
    await expect(page.getByTestId("stripe-setup-flow")).toContainText("3. Verify setup");
    await expect(page.getByTestId("stripe-setup-flow")).toContainText("4. Run safe test");
    await expect(page.getByTestId("stripe-setup-flow")).toContainText("5. Ready to take customer payments");
    const unavailable = page.getByTestId("stripe-wizard-unavailable");
    const reconnect = page.getByTestId("stripe-wizard-reconnect");
    await expect(unavailable.or(reconnect)).toBeVisible();
    if (await unavailable.count()) await expect(unavailable).toBeDisabled();
    await expect(page.getByTestId("stripe-wizard-verify")).toBeVisible();
    await expect(page.getByTestId("stripe-wizard-test")).toBeVisible();
    await expect(page.getByTestId("stripe-onboarding-wizard")).not.toContainText(/platform_account_required|STRIPE_SECRET_KEY|webhook secret|account id|Connect platform mismatch/i);
    await expect(page.getByTestId("stripe-onboarding-wizard")).not.toContainText(/environment|platform credential|MyTitan support|contact support|internal diagnostics/i);
  });

  test("Developer Tools owns API token and webhook actions", async ({ page }) => {
    await page.goto("/dashboard/settings/developer-tools", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Developer Tools", exact: true })).toBeVisible();
    await expect(page.getByTestId("developer-api-tokens")).toBeVisible();
    await expect(page.getByTestId("developer-webhooks")).toBeVisible();
    await expect(page.getByTestId("integration-api-token-create")).toBeVisible();
    await expect(page.getByTestId("integration-webhook-create")).toBeVisible();
    await expect(page.getByTestId("developer-webhooks")).toContainText("Team member arrived");
    await expect(page.getByTestId("developer-webhooks")).not.toContainText("Technician arrived");
  });

  test("Connected Tools and Payments remain readable without horizontal overflow in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    for (const route of ["/dashboard/integrations", "/dashboard/settings/payments/stripe"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyColor: getComputedStyle(document.body).color,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      }));
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      expect(metrics.bodyColor).not.toBe(metrics.bodyBackground);
    }
  });
});
