import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("workspace governance", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings are hidden and blocked for non-admin roles", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/dashboard/settings"]')).toHaveCount(0);

    await page.goto("/dashboard/settings");
    await expect(page.getByTestId("settings-governance-blocked")).toBeVisible();
  });

  test("owners can discover team management from navigation and settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/dashboard/users"]').first()).toBeVisible();

    await page.goto("/dashboard/settings?tab=team");
    await expect(page.getByTestId("settings-team-management-card")).toBeVisible();
    await page.getByTestId("settings-open-team-management").click();

    await expect(page.getByRole("heading", { name: "Team management", exact: true })).toBeVisible();
    await expect(page.getByTestId("team-invite-card")).toBeVisible();
    await expect(page.locator('[data-testid^="team-role-select-"]').first()).toBeVisible();
  });

  test("workspace admins can access team management and edit role controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/dashboard/users");
    await expect(page.getByRole("heading", { name: "Team management", exact: true })).toBeVisible();
    await expect(page.getByTestId("team-invite-submit")).toBeVisible();
    await expect(page.locator('[data-testid^="team-role-select-"]').first()).toBeVisible();
  });

  test("team invite API stays token-free and uses system delivery rules", async ({ page, request }) => {
    await installApiProxy(page, request);
    const login = await request.post("http://127.0.0.1:3000/auth/login", {
      data: { email: defaultOperatorEmail, password: defaultOperatorPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(login.ok()).toBeTruthy();
    const body = await login.json();
    const token = String(body?.token || "");
    expect(token).toBeTruthy();

    const inviteResponse = await requestLocalApi(request, "/users/invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { email: `invite-${Date.now()}@example.test`, role: "DISPATCHER" },
    });
    expect(inviteResponse.ok()).toBeTruthy();
    const inviteBody = await inviteResponse.json();

    expect(inviteBody?.ok).toBeTruthy();
    expect(String(inviteBody?.status || "")).toBe("delivery_unavailable");
    expect(String(inviteBody?.message || "")).toMatch(/suppressed|non-routable|internal test recipient domains/i);
    expect(String(inviteBody?.message || "")).not.toMatch(/customer email is not set up yet/i);
    expect(inviteBody?.token).toBeUndefined();
    expect(inviteBody?.acceptUrl).toBeUndefined();
    expect(inviteBody?.activationUrl).toBeUndefined();
    expect(inviteBody?.actionHref).toBeUndefined();
  });

  test("team invite page explains MyTitan-owned setup email", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/users");
    await expect(page.getByText(/MyTitan sends the setup email for team access/i)).toBeVisible();
    await expect(page.getByText(/workspace customer-email settings are not used here/i)).toBeVisible();
    await expect(page.getByText(/MyTitan sends the setup email when system email is ready/i)).toBeVisible();
  });

  test("team invite shows MyTitan system-email guidance when delivery is unavailable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.route("**/api/users/invite", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "delivery_unavailable",
          message: "MyTitan email is not set up yet. Please contact support.",
        }),
      });
    });

    await page.goto("/dashboard/users");
    await page.getByTestId("team-invite-email").fill(`invite-${Date.now()}@example.com`);
    await page.getByTestId("team-invite-submit").click();

    await expect(page.getByText(/MyTitan email is not set up yet\. Please contact support\./i)).toBeVisible();
    await expect(page.getByTestId("team-invite-card")).toContainText(/workspace customer-email settings are not used here/i);
  });

  test("finance roles can run billing actions but not portal lifecycle actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.financeEmail, fixtureRefs.financePassword);

    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.financeReadyJobRef)).toBeVisible();
    const financeRow = page.locator(".operator-table__row", { hasText: fixtureRefs.financeReadyJobRef }).first();
    const issueInvoiceAction = page.getByTestId(`billing-issue-invoice-${fixtureRefs.financeJobId}`);
    const markPaidAction = page.getByTestId(`billing-mark-paid-${fixtureRefs.financeJobId}`);
    if (await issueInvoiceAction.isVisible().catch(() => false)) {
      await issueInvoiceAction.click();
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Invoice is ready|Invoice issued/i);
    } else if (await markPaidAction.isVisible().catch(() => false)) {
      await markPaidAction.click();
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Payment recorded/i);
    } else {
      await expect(financeRow).toContainText(/Invoice issued|Issued|Paid/i);
    }

    await page.goto("/dashboard/portal");
    await expect(page.getByTestId("portal-governance-blocked")).toBeVisible();

    await page.goto("/dashboard/settings/operations");
    await expect(page.getByTestId("operations-governance-blocked")).toBeVisible();
  });

  test("technician roles can execute field actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    await page.goto("/dashboard/technician");
    await expect(page.locator(".operator-table__row", { hasText: fixtureRefs.technicianRoleJobRef }).first()).toBeVisible();
    await page.getByTestId(`technician-note-input-${fixtureRefs.technicianRoleJobId}`).fill("Governance technician note");
    await page.getByTestId(`technician-note-save-${fixtureRefs.technicianRoleJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Field note saved/i);

    await page.goto("/dashboard/settings/launch-control");
    await expect(page.getByTestId("launch-control-governance-blocked")).toBeVisible();
  });

  test("viewer navigation hides governed modules", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/dashboard/jobs"]').first()).toBeVisible();
    await expect(page.locator('a[href="/dashboard/settings"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/users"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/billing"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/portal"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/technician"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/intelligence"]')).toHaveCount(0);

    await page.goto("/dashboard/users");
    await expect(page.getByTestId("team-governance-blocked")).toBeVisible();
  });
});
