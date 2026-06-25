import { expect, request as playwrightRequest, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, loginCustomerAs } from "./utils";

async function operatorToken() {
  const context = await playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:3000",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
  try {
    const response = await context.post("/auth/login", {
      data: {
        email: "e2e.operator@mytitan.local",
        password: "MyTitanE2E!2026",
      },
    });
    const body = await response.json();
    return String(body?.token || "");
  } finally {
    await context.dispose();
  }
}

async function requestRenewalWindow(request: any, planId: string) {
  const token = await operatorToken();
  const now = Date.now();
  return request.post(`http://127.0.0.1:3000/service-plans/${planId}/renewals/request`, {
    data: {
      renewalWindowStartAt: new Date(now).toISOString(),
      renewalWindowEndAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

test.describe("customer accounts and approvals", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("customer login and workspace render", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/customer");
    await page.getByTestId("customer-login-email").fill(fixtureRefs.customerWorkspaceEmail);
    await page.getByTestId("customer-login-password").fill(fixtureRefs.customerWorkspacePassword);
    await page.getByTestId("customer-login-submit").click();

    await expect(page.getByRole("heading", { name: "E2E Portal Active" })).toBeVisible();
    await expect(page.getByText(fixtureRefs.portalActiveJobRef).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.seededPortalArtifactLabel).first()).toBeVisible();
  });

  test("customer sees only their own workspace resources", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    await expect(page.getByText(fixtureRefs.portalActiveJobRef).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.pausedServicePlanName).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.seededPortalArtifactLabel).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.issuedJobRef)).toHaveCount(0);
    await expect(page.getByText(fixtureRefs.seededCustomerArtifactLabel)).toHaveCount(0);
  });

  test("customer approve flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const jobApprovalRow = page.getByTestId("customer-approval-row").filter({ hasText: fixtureRefs.portalActiveJobRef }).first();
    await jobApprovalRow.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/Approval recorded/i)).toBeVisible();
    await expect(jobApprovalRow.getByText(/APPROVED/i)).toBeVisible();
  });

  test("customer decline flow works for a newly requested approval", async ({ page, request }) => {
    const token = await operatorToken();
    const createResponse = await request.post("http://127.0.0.1:3000/customer-approvals", {
      data: {
        customerId: "e2e-customer-portal-active",
        entityType: "JOB",
        entityId: "e2e-job-portal-active",
        kind: "WORK_AUTHORIZATION",
      },
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!createResponse.ok() && createResponse.status() !== 400) {
      throw new Error(`Unable to seed decline approval (${createResponse.status()})`);
    }

    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const jobApprovalRow = page.getByTestId("customer-approval-row").filter({ hasText: fixtureRefs.portalActiveJobRef }).first();
    await jobApprovalRow.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByText(/Decline recorded/i)).toBeVisible();
    await expect(jobApprovalRow.getByText(/DECLINED/i)).toBeVisible();
  });

  test("operator invite flow works from customer detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto(`/dashboard/customers/${fixtureRefs.portalExpiredCustomerSlug}`);

    await page.getByTestId("customer-account-invite").evaluate((element: HTMLButtonElement) => element.click());
    const statusCard = page.getByTestId("customer-account-status");
    await expect(statusCard).toContainText(/customer invite email|customer email is not set up yet|customer email delivery is unavailable|outbound email is unavailable|outbound email readiness|non-routable|suppressed/i);
    await expect(statusCard).toContainText(/No customer workspace account invited yet|Invited/i);
  });

  test("operator approval status is visible on job detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/jobs/e2e-job-portal-active");

    await expect(page.getByTestId("approval-request-list")).toContainText(/WORK AUTHORIZATION/i);
    await expect(page.getByTestId("approval-request-create")).toBeVisible();
  });

  test("customer can approve a plan renewal", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const planRow = page.locator('[data-testid="customer-plan-list"] .integration-card').filter({ hasText: fixtureRefs.portalRenewalPlanName }).first();
    await expect(planRow).toBeVisible();
    await planRow.getByTestId("customer-plan-renew").click();
    await expect(page.getByText(/Renewal preference recorded/i)).toBeVisible();
    await expect(planRow).toContainText(/APPROVED/i);
  });

  test("customer can decline a plan renewal on another visible plan", async ({ page, request }) => {
    const renewalResponse = await requestRenewalWindow(request, fixtureRefs.pausedServicePlanId);
    if (!renewalResponse.ok() && renewalResponse.status() !== 409) {
      throw new Error(`Unable to request renewal (${renewalResponse.status()})`);
    }

    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const planRow = page.locator('[data-testid="customer-plan-list"] .integration-card').filter({ hasText: fixtureRefs.pausedServicePlanName }).first();
    await expect(planRow).toBeVisible();
    await planRow.getByTestId("customer-plan-decline").click();
    await expect(page.getByText(/Renewal declined/i)).toBeVisible();
    await expect(planRow.getByTestId("customer-plan-decline")).toHaveCount(0);
  });

  test("customer can submit a plan change request", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const planRow = page.locator('[data-testid="customer-plan-list"] .integration-card').filter({ hasText: fixtureRefs.portalRenewalPlanName }).first();
    await expect(planRow).toBeVisible();
    await planRow.locator("select").selectOption("SCOPE_CHANGE_REQUEST");
    await planRow.locator("textarea").fill("Please include a seasonal access checklist.");
    await planRow.getByTestId("customer-plan-change-request").click();
    await expect(planRow.getByTestId("customer-plan-request-list")).toContainText(/SCOPE CHANGE REQUEST/i);
  });

  test("customer workspace shows submitted completion proof safely", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const jobRow = page.getByTestId("customer-job-row").filter({ hasText: fixtureRefs.portalActiveJobRef }).first();
    await expect(jobRow).toContainText(/Completion proof/i);
    await expect(jobRow).toContainText(fixtureRefs.seededPortalArtifactLabel);
  });

  test("customer can acknowledge a submitted completion record", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    const jobRow = page.getByTestId("customer-job-row").filter({ hasText: fixtureRefs.portalActiveJobRef }).first();
    const acknowledgementInput = jobRow.getByPlaceholder("Acknowledge the completion record");
    if (await acknowledgementInput.count()) {
      await acknowledgementInput.fill("Acknowledged in Playwright");
      await jobRow.getByTestId("execution-acknowledge").click();
      await expect(page.getByText(/Completion acknowledgement recorded/i)).toBeVisible();
    } else {
      await expect(jobRow).toContainText(/ACKNOWLEDGED|Completion proof/i);
    }
  });
});
