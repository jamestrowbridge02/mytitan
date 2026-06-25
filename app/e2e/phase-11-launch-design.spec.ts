import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("Phase 11 launch design and Stripe action acceptance", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running Phase 11 coverage.");

  test.beforeEach(async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
  });

  test("sidebar hides the visible shortcut hint while Ctrl+K and Cmd+K still open search", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const search = page.getByTestId("sidebar-global-search");
    await page.getByRole("complementary").hover();
    await expect(search).toContainText("Search...");
    await expect(search).not.toContainText(/Ctrl|Cmd|⌘/i);

    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });

  test("Fix Stripe setup navigates to a populated dedicated wizard", async ({ page }) => {
    await page.goto("/dashboard/settings/payments", { waitUntil: "networkidle" });
    await page.getByTestId("payments-fix-stripe").click();

    await expect(page).toHaveURL(/\/dashboard\/settings\/payments\/stripe$/);
    const wizard = page.getByTestId("stripe-onboarding-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText("Stripe customer payments");
    await expect(wizard).toContainText("Readiness checklist");
    await expect(wizard).toContainText("Stripe account linked");
    const unavailable = page.getByTestId("stripe-wizard-unavailable");
    const reconnect = page.getByTestId("stripe-wizard-reconnect");
    await expect(unavailable.or(reconnect)).toBeVisible();
    if (await unavailable.count()) await expect(unavailable).toBeDisabled();
    await expect(page.getByTestId("stripe-wizard-verify")).toBeVisible();
    await expect(page.getByTestId("stripe-wizard-test")).toBeVisible();
    await expect(page.getByTestId("stripe-review-payments")).toHaveAttribute("href", "/dashboard/settings/payments");
    await expect(wizard).not.toContainText(/^\s*[1-5]\s*$/);
    await expect(wizard.locator(".stripe-onboarding-step")).toHaveCount(0);
    await expect(wizard).not.toContainText(/Contact MyTitan support if verification still fails/i);
    await expect(wizard).not.toContainText(/platform_account_required|STRIPE_SECRET_KEY|webhook secret|Connect platform mismatch/i);
  });

  test("Reconnect, verify, checkout test, and disconnect actions produce visible results", async ({ page }) => {
    let onboardingCalls = 0;
    let verifyCalls = 0;
    let testCalls = 0;
    let disconnectCalls = 0;
    let disconnected = false;
    await page.route("**/billing/customer-payment-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: [{
            provider: "stripe-connect",
            readinessState: disconnected ? "not_connected" : "needs_attention",
            readinessLabel: disconnected ? "Not connected" : "Needs attention",
            checkoutEligible: false,
            checks: {
              accountLinked: !disconnected,
              businessVerified: false,
              customerPaymentsEnabled: false,
              depositCheckoutReady: false,
              paymentEventsVerified: false,
            },
          }],
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/onboarding", async (route) => {
      onboardingCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          actionUrl: null,
          state: "platform_configuration_needed",
          summary: "Stripe is linked, but a new setup session cannot be opened yet. Verify again or disconnect and reconnect after payment configuration is updated.",
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/verify", async (route) => {
      verifyCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          state: "needs_attention",
          summary: "Stripe is linked, but payments cannot be verified in this workspace yet. Reconnect or verify again from payment settings.",
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/test", async (route) => {
      testCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          state: "needs_attention",
          dryRun: true,
          liveMutation: false,
          summary: "Deposit checkout is not ready. Review the checklist before offering online deposits.",
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/disconnect", async (route) => {
      disconnectCalls += 1;
      disconnected = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          summary: "Stripe customer payments were disconnected from this workspace.",
        }),
      });
    });

    await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
    await page.getByTestId("stripe-wizard-reconnect").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText("Stripe setup needs attention");
    await expect(page.getByTestId("stripe-action-result")).toContainText("Stripe is linked, but a new setup session cannot be opened yet");
    await expect(page.getByTestId("stripe-wizard-try-again")).toBeVisible();
    await expect(page.getByTestId("stripe-review-payments")).toBeVisible();
    await expect(page.getByTestId("stripe-wizard-disconnect")).toBeVisible();
    expect(onboardingCalls).toBe(1);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("stripe-wizard-verify").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText("Stripe setup needs attention");
    expect(verifyCalls).toBe(1);

    await page.getByTestId("stripe-wizard-test").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText("Checkout needs attention");
    expect(testCalls).toBe(1);
    expect(verifyCalls).toBe(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("stripe-wizard-disconnect").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText("Stripe disconnected");
    await expect(page.getByTestId("stripe-onboarding-wizard")).toContainText("Not connected");
    await expect(page.getByTestId("stripe-wizard-disconnect")).toHaveCount(0);
    expect(disconnectCalls).toBe(1);
  });

  test("valid onboarding actionUrl still redirects to Stripe", async ({ page }) => {
    await page.route("**/billing/customer-payment-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: [{
            provider: "stripe-connect",
            readinessState: "not_connected",
            readinessLabel: "Not connected",
            checkoutEligible: false,
            onboardingAvailable: true,
            platformConfigAvailable: true,
            checks: {},
          }],
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/onboarding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "live",
          state: "onboarding_link_created",
          actionUrl: "https://connect.stripe.com/setup/e/test_redirect",
        }),
      });
    });
    await page.route("https://connect.stripe.com/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Stripe onboarding</body></html>" });
    });

    await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
    await page.getByTestId("stripe-wizard-reconnect").click();
    await expect(page).toHaveURL("https://connect.stripe.com/setup/e/test_redirect");
  });

  test("Stripe refresh return offers a fresh Account Link without looping", async ({ page }) => {
    await page.route("**/billing/customer-payment-readiness", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: [{
            provider: "stripe-connect",
            readinessState: "needs_setup",
            readinessLabel: "Setup incomplete",
            checkoutEligible: false,
            onboardingAvailable: true,
            platformConfigAvailable: true,
            checks: { accountLinked: true },
          }],
        }),
      });
    });
    await page.route("**/billing/customer-payment-readiness/stripe-connect/onboarding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "live",
          state: "onboarding_link_created",
          actionUrl: "https://connect.stripe.com/setup/e/test_refresh_retry",
        }),
      });
    });
    await page.route("https://connect.stripe.com/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Stripe onboarding retry</body></html>" });
    });

    await page.goto("/dashboard/settings/payments/stripe?stripe=refresh", { waitUntil: "networkidle" });
    await expect(page).toHaveURL("/dashboard/settings/payments/stripe");
    await expect(page.getByTestId("stripe-action-result")).toContainText("Continue Stripe setup");
    await page.getByTestId("stripe-wizard-try-again").click();
    await expect(page).toHaveURL("https://connect.stripe.com/setup/e/test_refresh_retry");
  });

  test("Disconnect Stripe uses the live backend and readback changes to Not connected", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const suffix = Date.now();
    const setup = await requestLocalApi(request, "/integrations/byog/stripe-customer-payments", {
      method: "PUT",
      headers,
      data: {
        scope: "workspace",
        status: "CONNECTED",
        secretMaterial: `phase11b-webhook-${suffix}`,
        credentials: { connectedAccountId: `acct_phase11b_${suffix}` },
      },
    });
    expect(setup.ok()).toBeTruthy();

    await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
    if (await page.getByTestId("stripe-wizard-reconnect").isVisible().catch(() => false)) {
      await expect(page.getByTestId("stripe-wizard-reconnect")).toBeEnabled();
    } else {
      await expect(page.getByTestId("stripe-wizard-unavailable")).toBeDisabled();
    }
    await page.getByTestId("stripe-wizard-verify").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText(
      /Stripe setup verified|Stripe setup needs attention/i,
    );
    await page.getByTestId("stripe-wizard-test").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText(
      /Checkout is ready|Checkout needs attention/i,
    );
    await expect(page.getByTestId("stripe-wizard-disconnect")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("stripe-wizard-disconnect").click();
    await expect(page.getByTestId("stripe-action-result")).toContainText("Stripe disconnected");
    await expect(page.getByTestId("stripe-onboarding-wizard")).toContainText("Not connected");
    await expect(page.getByTestId("stripe-wizard-disconnect")).toHaveCount(0);

    const readiness = await requestLocalApi(request, "/billing/customer-payment-readiness", { headers });
    expect(readiness.ok()).toBeTruthy();
    const payload = await readiness.json();
    const stripe = payload.providers.find((provider: any) => provider.provider === "stripe-connect");
    expect(stripe.readinessState).toBe("not_connected");
    expect(stripe.checkoutEligible).toBe(false);
    expect(payload.separation.fallback).toBe("never_fallback_to_mytitan_stripe");
  });

  test("light and dark workspace themes visibly apply and persist across payment page reloads", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const current = await requestLocalApi(request, "/tenant/settings", { headers });
    expect(current.ok()).toBeTruthy();
    const originalMode = (await current.json()).themeMode || "light";

    try {
      await page.goto("/dashboard/settings?tab=general&section=business-profile", { waitUntil: "networkidle" });
      await page.getByTestId("settings-theme-light").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

      await page.goto("/dashboard/settings?tab=general&section=business-profile", { waitUntil: "networkidle" });
      await page.getByTestId("settings-theme-dark").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      await page.evaluate(() => {
        window.localStorage.removeItem("mytitan_token");
        window.localStorage.removeItem("mytitan_theme_mode");
      });
      await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
      await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      await page.goto("/dashboard/settings?tab=general&section=business-profile", { waitUntil: "networkidle" });
      await page.getByTestId("settings-theme-system").click();
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PATCH",
        headers,
        data: { themeMode: originalMode },
      });
    }
  });

  test("premium payment surfaces stay readable and overflow-free in saved light and dark themes", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const current = await requestLocalApi(request, "/tenant/settings", { headers });
    const originalMode = (await current.json()).themeMode || "light";
    try {
      for (const theme of ["light", "dark"] as const) {
        const saved = await requestLocalApi(request, "/tenant/settings", {
          method: "PATCH",
          headers,
          data: { themeMode: theme },
        });
        expect(saved.ok()).toBeTruthy();
        for (const route of [
          "/dashboard/settings/payments/stripe",
          "/dashboard/settings/payments",
          "/dashboard/integrations",
          "/dashboard/settings?tab=general&section=regional-settings",
          "/dashboard/setup-wizard",
        ]) {
          await page.goto(route, { waitUntil: "networkidle" });
          const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            foreground: getComputedStyle(document.body).color,
            background: getComputedStyle(document.body).backgroundColor,
            theme: document.documentElement.dataset.theme,
          }));
          expect(metrics.overflow).toBeLessThanOrEqual(1);
          expect(metrics.foreground).not.toBe(metrics.background);
          expect(metrics.theme).toBe(theme);
        }
      }
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PATCH",
        headers,
        data: { themeMode: originalMode },
      });
    }
  });
});
