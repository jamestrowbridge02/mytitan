import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

async function customerAuthHeaders(request: any) {
  const response = await request.post("http://127.0.0.1:3000/customer-auth/login", {
    data: {
      email: fixtureRefs.customerWorkspaceEmail,
      password: fixtureRefs.customerWorkspacePassword,
    },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(`Failed customer auth (${response.status()})`);
  }
  const body = await response.json();
  return {
    Authorization: `Bearer ${String(body?.token || "")}`,
    "Content-Type": "application/json",
  };
}

async function operatorAuthHeaders(request: any) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    data: {
      email: "e2e.operator@mytitan.local",
      password: "MyTitanE2E!2026",
    },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(`Failed operator auth (${response.status()})`);
  }
  const body = await response.json();
  return {
    Authorization: `Bearer ${String(body?.token || "")}`,
    "Content-Type": "application/json",
  };
}

test.describe("service plans", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("plan list and history render", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await expect(page.getByTestId("service-plan-list")).toBeVisible();
    await expect(page.getByTestId(`service-plan-row-${fixtureRefs.activeServicePlanId}`)).toContainText(fixtureRefs.activeServicePlanName);
    await expect(page.getByTestId(`service-plan-row-${fixtureRefs.pausedServicePlanId}`)).toContainText(fixtureRefs.pausedServicePlanName);
    await expect(page.getByTestId("service-plan-history")).toContainText(/EXECUTED/i);
  });

  test("create plan flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await page.getByTestId("service-plan-create").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("service-plan-customer").selectOption(fixtureRefs.convertibleCustomerId);
    await page.getByTestId("service-plan-name").fill("Monthly Filter Refresh");
    await page.getByTestId("service-plan-description").fill("Playwright-created recurring plan");
    await page.getByTestId("service-plan-cadence-unit").selectOption("MONTH");
    await page.getByTestId("service-plan-cadence-interval").fill("1");
    await page.getByTestId("service-plan-next-run").fill("2026-03-20T09:30");
    await page.getByTestId("service-plan-mode").selectOption("job");
    await page.getByTestId("service-plan-tasks").fill("Replace filter\nRecord inspection");
    await page.getByTestId("service-plan-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.locator(".operator-cellTitle", { hasText: "Monthly Filter Refresh" }).first()).toBeVisible();
  });

  test("pause and resume actions work", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    const activeRow = page.getByTestId(`service-plan-row-${fixtureRefs.activeServicePlanId}`);
    await expect(activeRow).toContainText(fixtureRefs.activeServicePlanName);
    await expect(activeRow.getByRole("button", { name: "Pause" })).toBeVisible();
    await activeRow.getByRole("button", { name: "Pause" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Service plan paused/i)).toBeVisible();
    await expect(activeRow).toContainText(fixtureRefs.activeServicePlanName);

    const pausedRow = page.getByTestId(`service-plan-row-${fixtureRefs.pausedServicePlanId}`);
    await expect(pausedRow).toContainText(fixtureRefs.pausedServicePlanName);
    await expect(pausedRow.getByRole("button", { name: "Resume" })).toBeVisible();
    await pausedRow.getByRole("button", { name: "Resume" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Service plan resumed/i)).toBeVisible();
  });

  test("run-now executes the selected plan", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await page.getByTestId(`service-plan-row-${fixtureRefs.portalRenewalPlanId}`).evaluate((element: HTMLElement) => element.click());
    await page.getByTestId("service-plan-run-now").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("service-plan-history")).toContainText(/Booking|Job/i);
  });

  test("customer detail shows linked plans", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/customers/${fixtureRefs.convertibleCustomerSlug}`);
    await expect(page.getByRole("heading", { name: "Service plans" })).toBeVisible();
    await expect(page.getByTestId("customer-service-plans")).toContainText(/Quarterly Vehicle Health Check|recurring plan/i);
  });

  test("renewal and change-request queues render", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/service-plans");
    await expect(page.getByTestId("service-plan-renewal-list")).toContainText(fixtureRefs.portalRenewalPlanName);
    await expect(page.getByTestId("service-plan-change-request-list")).toContainText(/RESUME REQUEST/i);
  });

  test("operator can approve and complete a customer plan request", async ({ page, request }) => {
    const headers = await customerAuthHeaders(request);
    const uniqueNote = `Please stop this plan at the next renewal point. [pw-${Date.now()}]`;
    const createResponse = await request.post(`http://127.0.0.1:3000/customer/service-plans/${fixtureRefs.portalRenewalPlanId}/change-request`, {
      data: {
        kind: "CANCEL_REQUEST",
        note: uniqueNote,
      },
      headers,
    });
    if (!createResponse.ok()) {
      throw new Error(`Unable to create customer plan request (${createResponse.status()})`);
    }
    const createdRequest = await createResponse.json();

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/service-plans");

    const requestRow = page.getByTestId("service-plan-change-request-list").locator(".operator-table__row").filter({ hasText: uniqueNote }).first();
    await expect(requestRow).toBeVisible();
    await requestRow.getByTestId("service-plan-request-approve").evaluate((element: HTMLButtonElement) => element.click());
    await expect(requestRow).toContainText(/APPROVED/i);
    await expect.poll(async () => {
      const listResponse = await request.get("http://127.0.0.1:3000/service-plans/change-requests", {
        headers: await operatorAuthHeaders(request),
      });
      const rows = await listResponse.json();
      const target = Array.isArray(rows) ? rows.find((row: any) => row?.id === createdRequest?.id) : null;
      return target?.status || null;
    }).toBe("APPROVED");
    const operatorHeaders = await operatorAuthHeaders(request);
    const completeResponse = await request.post(`http://127.0.0.1:3000/service-plans/change-requests/${createdRequest.id}/complete`, {
      headers: operatorHeaders,
      data: {},
    });
    expect(completeResponse.ok()).toBeTruthy();
    await expect.poll(async () => {
      const listResponse = await request.get("http://127.0.0.1:3000/service-plans/change-requests", {
        headers: operatorHeaders,
      });
      const rows = await listResponse.json();
      const target = Array.isArray(rows) ? rows.find((row: any) => row?.id === createdRequest?.id) : null;
      return target?.status || null;
    }).toBe("COMPLETED");
    await page.reload();
    await expect(page.getByTestId("service-plan-change-request-list")).toContainText(/COMPLETED/i);
  });

  test("operator can decline a customer plan request", async ({ page, request }) => {
    const headers = await customerAuthHeaders(request);
    const createResponse = await request.post(`http://127.0.0.1:3000/customer/service-plans/${fixtureRefs.pausedServicePlanId}/change-request`, {
      data: {
        kind: "SCOPE_CHANGE_REQUEST",
        note: "Please add photo proof to this plan.",
      },
      headers,
    });
    if (!createResponse.ok()) {
      throw new Error(`Unable to create decline candidate (${createResponse.status()})`);
    }

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/service-plans");

    const requestRow = page.getByTestId("service-plan-change-request-list").locator(".operator-table__row").filter({ hasText: "SCOPE CHANGE REQUEST" }).first();
    await expect(requestRow).toBeVisible();
    await requestRow.getByTestId("service-plan-request-decline").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Request declined/i)).toBeVisible();
  });
});
