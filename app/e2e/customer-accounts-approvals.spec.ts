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

    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(page.getByText(/Approval recorded/i)).toBeVisible();
    await expect(page.getByText(/APPROVED/i).first()).toBeVisible();
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

    await page.getByRole("button", { name: "Decline" }).first().click();
    await expect(page.getByText(/Decline recorded/i)).toBeVisible();
    await expect(page.getByText(/DECLINED/i).first()).toBeVisible();
  });

  test("operator invite flow works from customer detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto(`/dashboard/customers/${fixtureRefs.portalExpiredCustomerSlug}`);

    await page.getByTestId("customer-account-invite").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("customer-account-status")).toContainText(fixtureRefs.portalExpiredCustomerEmail);
  });

  test("operator approval status is visible on job detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/jobs/e2e-job-portal-active");

    await expect(page.getByTestId("approval-request-list")).toContainText(/WORK AUTHORIZATION/i);
    await expect(page.getByTestId("approval-request-create")).toBeVisible();
  });
});
