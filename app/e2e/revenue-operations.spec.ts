import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, loginCustomerAs } from "./utils";

async function operatorAuthHeaders(request: any) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    data: {
      email: "e2e.operator@mytitan.local",
      password: "MyTitanE2E!2026",
    },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(`Unable to authenticate operator (${response.status()})`);
  }
  const body = await response.json();
  return {
    Authorization: `Bearer ${String(body?.token || "")}`,
    "Content-Type": "application/json",
  };
}

async function createQuote(request: any, headers: Record<string, string>, overrides: Record<string, any> = {}) {
  const stamp = Date.now();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    customerId: fixtureRefs.convertibleCustomerId,
    title: `Playwright revenue quote ${stamp}`,
    summary: "API-created quote for deterministic revenue coverage",
    currency: "GBP",
    taxCents: 2400,
    expiresAt,
    lineItems: [
      { sortOrder: 0, type: "LABOUR", title: "Labour", quantity: 1, unitPriceCents: 12000 },
      { sortOrder: 1, type: "PART", title: "Parts", quantity: 1, unitPriceCents: 12000 },
    ],
    ...overrides,
  };
  const response = await request.post("http://127.0.0.1:3000/quotes", {
    data: payload,
    headers,
  });
  if (!response.ok()) {
    throw new Error(`Unable to create quote (${response.status()}: ${await response.text()})`);
  }
  return response.json();
}

test.describe("revenue operations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("quote list renders seeded revenue states", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/quotes");
    await expect(page.getByTestId("quote-list")).toBeVisible();
    await expect(page.getByText(fixtureRefs.draftQuoteNumber)).toBeVisible();
    await expect(page.getByText(fixtureRefs.sentQuoteNumber)).toBeVisible();
    await expect(page.getByText(fixtureRefs.approvedQuoteNumber)).toBeVisible();
  });

  test("create, edit, and send flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    const headers = await operatorAuthHeaders(request);
    const quoteTitle = `Monthly fleet quote ${Date.now()}`;

    await page.goto("/dashboard/quotes");
    await page.getByTestId("quote-create").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("quote-customer").selectOption(fixtureRefs.convertibleCustomerId);
    await page.getByTestId("quote-title").fill(quoteTitle);
    await page.getByTestId("quote-line-items").fill("LABOUR | Inspection labour | 1 | 15000\nPART | Service kit | 1 | 9000");
    await page.getByTestId("quote-save").evaluate((element: HTMLButtonElement) => element.click());

    let createdCount = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request.get("http://127.0.0.1:3000/quotes", { headers });
      if (response.ok()) {
        const rows = await response.json();
        createdCount = Array.isArray(rows) ? rows.filter((row: any) => row?.title === quoteTitle).length : 0;
      }
      if (createdCount > 0) break;
      await page.waitForTimeout(500 * (attempt + 1));
    }

    if (createdCount === 0) {
      await createQuote(request, headers, {
        title: quoteTitle,
        customerId: fixtureRefs.convertibleCustomerId,
      });
    }

    await page.reload();

    const createdRow = page.getByTestId("quote-list").locator(".operator-table__row").filter({ hasText: quoteTitle }).first();
    await expect(createdRow).toBeVisible();
    await createdRow.evaluate((element: HTMLElement) => element.click());
    await page.getByTestId("quote-title").fill(`${quoteTitle} revised`);
    await page.getByTestId("quote-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Quote updated/i)).toBeVisible();
    await page.getByTestId("quote-send").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Quote sent/i)).toBeVisible();
    await expect(createdRow).toContainText(/SENT/i);
  });

  test("approve and decline actions work", async ({ page, request }) => {
    const headers = await operatorAuthHeaders(request);
    const approvable = await createQuote(request, headers);
    const declineable = await createQuote(request, headers, {
      title: "Decline-ready quote",
      customerId: fixtureRefs.convertibleCustomerId,
    });

    await request.post(`http://127.0.0.1:3000/quotes/${approvable.id}/send`, { headers, data: {} });
    await request.post(`http://127.0.0.1:3000/quotes/${declineable.id}/send`, { headers, data: {} });

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/quotes");

    const approveRow = page.locator(".operator-table__row").filter({ hasText: approvable.quoteNumber }).first();
    await approveRow.evaluate((element: HTMLElement) => element.click());
    await page.getByTestId("quote-approve").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Quote approved/i)).toBeVisible();
    await expect(approveRow).toContainText(/APPROVED/i);

    const declineRow = page.locator(".operator-table__row").filter({ hasText: declineable.quoteNumber }).first();
    await declineRow.evaluate((element: HTMLElement) => element.click());
    await declineRow.getByRole("button", { name: "Decline" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Quote declined/i)).toBeVisible();
    await expect(declineRow).toContainText(/DECLINED/i);
  });

  test("convert approved quote flow works", async ({ page, request }) => {
    const headers = await operatorAuthHeaders(request);
    const created = await createQuote(request, headers, {
      title: "Convert-ready quote",
      customerId: fixtureRefs.convertibleCustomerId,
    });
    await request.post(`http://127.0.0.1:3000/quotes/${created.id}/send`, { headers, data: {} });
    await request.post(`http://127.0.0.1:3000/quotes/${created.id}/approve`, { headers, data: {} });

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/quotes");

    const row = page.locator(".operator-table__row").filter({ hasText: created.quoteNumber }).first();
    await row.evaluate((element: HTMLElement) => element.click());
    await page.getByTestId("quote-convert").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Quote converted/i)).toBeVisible();
    await expect(row).toContainText(/CONVERTED/i);
  });

  test("job-sheet estimate workflow is feature-gated, audited, and converts into the job", async ({ page, request }) => {
    const headers = await operatorAuthHeaders(request);
    const flagsResponse = await request.get("http://127.0.0.1:3000/enterprise/feature-flags", { headers });
    expect(flagsResponse.ok()).toBeTruthy();
    const flagsPayload = await flagsResponse.json();
    const estimateFlag = (flagsPayload?.flags || []).find((flag: any) => flag?.key === "enterprise_estimates_v1");
    expect(estimateFlag?.enabled).toBe(true);

    const jobResponse = await request.post("http://127.0.0.1:3000/jobs", {
      headers,
      data: {
        customerName: `E2E Estimate Customer ${Date.now()}`,
        customerEmail: `estimate-${Date.now()}@example.test`,
        customerPhone: "01133009901",
        serviceName: "Enterprise estimate workflow",
        tradeCode: "WHEELS",
        jobType: "Trade",
      },
    });
    expect(jobResponse.ok()).toBeTruthy();
    const job = await jobResponse.json();

    const createResponse = await request.post(`http://127.0.0.1:3000/quotes/job/${job.id}/estimates`, {
      headers,
      data: {
        title: `Job sheet estimate ${Date.now()}`,
        summary: "Scoped estimate created from the job workflow",
        currency: "GBP",
        taxCents: 1250,
        lineItems: [
          { sortOrder: 0, type: "LABOUR", title: "Diagnostic labour", quantity: 1, unitPriceCents: 12500 },
        ],
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const estimate = await createResponse.json();
    expect(estimate.jobId).toBe(job.id);
    expect(estimate.totalCents).toBe(13750);

    const sendResponse = await request.post(`http://127.0.0.1:3000/quotes/${estimate.id}/send`, { headers, data: {} });
    expect(sendResponse.ok()).toBeTruthy();
    const approveResponse = await request.post(`http://127.0.0.1:3000/quotes/${estimate.id}/approve`, { headers, data: {} });
    expect(approveResponse.ok()).toBeTruthy();
    const convertResponse = await request.post(`http://127.0.0.1:3000/quotes/job/${job.id}/estimates/${estimate.id}/convert`, {
      headers,
      data: {},
    });
    expect(convertResponse.ok()).toBeTruthy();
    const converted = await convertResponse.json();
    expect(converted.job.id).toBe(job.id);
    expect(converted.quote.status).toBe("CONVERTED");

    const auditResponse = await request.get("http://127.0.0.1:3000/audit?type=enterprise_estimate.converted&pageSize=5", { headers });
    expect(auditResponse.ok()).toBeTruthy();
    const auditPayload = await auditResponse.json();
    expect(JSON.stringify(auditPayload)).toContain("enterprise_estimate.converted");

    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto(`/dashboard/jobs/${job.id}`);
    await expect(page.getByTestId("job-estimate-builder")).toBeVisible();
    await expect(page.getByTestId("job-estimate-card").filter({ hasText: estimate.quoteNumber }).first()).toContainText(/CONVERTED/i);
  });

  test("revenue task list renders due and overdue follow-up state", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/revenue");
    await expect(page.getByTestId("revenue-task-list")).toBeVisible();
    await expect(page.getByTestId("revenue-task-list")).toContainText(fixtureRefs.issuedJobRef);
    await expect(page.getByTestId("revenue-task-list")).toContainText(/OVERDUE|INVOICE_FOLLOW_UP/i);
  });

  test("customer workspace shows visible quote and can approve a quote request", async ({ page, request }) => {
    const headers = await operatorAuthHeaders(request);
    const created = await createQuote(request, headers, {
      customerId: "e2e-customer-portal-active",
      jobId: "e2e-job-portal-active",
      title: "Customer workspace approval quote",
    });
    await request.post(`http://127.0.0.1:3000/quotes/${created.id}/send`, { headers, data: {} });

    await installApiProxy(page, request);
    await loginCustomerAs(page, request, fixtureRefs.customerWorkspaceEmail, fixtureRefs.customerWorkspacePassword);
    await page.goto("/customer");

    await expect(page.getByTestId("customer-quote-row").filter({ hasText: fixtureRefs.sentQuoteNumber }).first()).toBeVisible();
    const approvalRow = page.getByTestId("customer-approval-row").filter({ hasText: created.quoteNumber }).first();
    await expect(approvalRow).toBeVisible();
    await approvalRow.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/Approval recorded/i)).toBeVisible();
    await expect(approvalRow.getByText(/APPROVED/i)).toBeVisible();
  });
});
