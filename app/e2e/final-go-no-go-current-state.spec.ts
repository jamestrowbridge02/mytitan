import { expect, test } from "@playwright/test";
import {
  fixtureRefs,
  hasDashboardAuth,
  installApiProxy,
  loginAs,
  requestLocalApi,
} from "./utils";

test.describe("final go/no-go current-state audit", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running final go/no-go coverage.");

  test.beforeEach(async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
  });

  test("Stripe, Connected Tools, and Payments expose one authoritative setup surface each", async ({ page }) => {
    await page.goto("/dashboard/settings/payments/stripe", { waitUntil: "networkidle" });
    await expect(page.getByTestId("stripe-onboarding-wizard")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Stripe customer payments", exact: true })).toHaveCount(1);
    await expect(page.getByTestId("stripe-setup-flow")).toHaveCount(1);
    await expect(page.locator(".stripe-readiness-card")).toHaveCount(2);
    await expect(page.locator(".stripe-onboarding-step")).toHaveCount(0);

    await page.goto("/dashboard/integrations", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Connected tools", exact: true })).toHaveCount(1);
    await expect(page.getByTestId("integrations-workspace-section")).toHaveCount(1);
    await expect(page.getByTestId("integration-workspace-row-stripe")).toHaveCount(1);

    await page.goto("/dashboard/settings/payments", { waitUntil: "networkidle" });
    await expect(page.getByTestId("payments-hub")).toHaveCount(1);
    await expect(page.getByTestId("payments-provider-stripe-customer-payments")).toHaveCount(1);
    await expect(page.getByTestId("stripe-setup-guide")).toHaveCount(0);
  });

  test("key route action links have real destinations and no empty action targets", async ({ page }) => {
    for (const route of [
      "/dashboard",
      "/dashboard/bookings",
      "/dashboard/calendar",
      "/dashboard/customers",
      "/dashboard/jobs",
      "/dashboard/finance",
      "/dashboard/settings/payments",
      "/dashboard/integrations",
      "/dashboard/settings/developer-tools",
      "/dashboard/settings",
    ]) {
      await page.goto(route, { waitUntil: "networkidle" });
      const invalidTargets = await page.locator("a:visible").evaluateAll((anchors) =>
        anchors
          .map((anchor) => ({
            text: (anchor.textContent || "").trim(),
            href: anchor.getAttribute("href") || "",
          }))
          .filter((anchor) => !anchor.href || anchor.href === "#"),
      );
      expect(invalidTargets, `Invalid visible action targets on ${route}`).toEqual([]);
    }
  });

  test("invoice statement generation persists and the send action reports a real outcome", async ({ page, request }) => {
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const beforeResponse = await requestLocalApi(request, "/billing/statements", { headers });
    expect(beforeResponse.ok()).toBeTruthy();
    const before = await beforeResponse.json();

    await page.goto("/dashboard/finance", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Statements/i }).click();
    const customer = page.getByTestId("statement-customer");
    await expect(customer).toBeVisible();
    const options = await customer.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => ({ value: (node as HTMLOptionElement).value, label: node.textContent || "" })),
    );
    const selectable = options.find((option) => option.value);
    expect(selectable).toBeTruthy();
    await customer.selectOption(selectable!.value);
    await page.getByRole("button", { name: "Generate statement", exact: true }).click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Statement .* generated/i);

    const afterResponse = await requestLocalApi(request, "/billing/statements", { headers });
    expect(afterResponse.ok()).toBeTruthy();
    const after = await afterResponse.json();
    expect(after.length).toBeGreaterThan(before.length);

    const generatedReference = String(after[0]?.reference || "");
    expect(generatedReference).toBeTruthy();
    const generatedRow = page.locator(".operator-table__row").filter({ hasText: generatedReference }).first();
    await expect(generatedRow).toBeVisible();
    await generatedRow.getByRole("button", { name: "Send statement", exact: true }).click();
    await expect(page.locator('[data-testid="operator-notice-success"], [data-testid="operator-notice-error"]').first()).toContainText(
      /Statement sent|not completed|unavailable|sender|delivery/i,
    );
  });

  test("public job portal avoids internal diagnostics and dead support wording", async ({ page }) => {
    await page.goto(`/portal/job/${fixtureRefs.portalToken}`, { waitUntil: "networkidle" });
    const body = page.locator("body");
    await expect(body).not.toContainText(/contact support|platform_account_required|STRIPE_SECRET_KEY|webhook secret|account id/i);
    await expect(body).not.toContainText(/\/opt\/|process\.env|localhost:|127\.0\.0\.1/i);
  });
});
