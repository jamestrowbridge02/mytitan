import { expect, test, type Page } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createCompletedJob(request: any, token: string, suffix: string) {
  const response = await requestLocalApi(request, "/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      customerName: `Finance Customer ${suffix}`,
      customerEmail: `finance-${suffix}@example.test`,
      customerPhone: "01133001122",
      serviceName: "Finance Reporting Job",
      laborCents: 10000,
      partsCents: 2500,
      miscCents: 0,
      taxRateBps: 2000,
      tradeCode: "GENERAL",
      jobType: "Trade",
      completeAfterCreate: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload?.created || payload;
}

test.describe("booking finance", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings groups finance and tax defaults under workspace settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=general", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Finance and tax defaults" })).toBeVisible();
    await expect(page.getByText("VAT number")).toBeVisible();
    await expect(page.getByText("Invoice number prefix")).toBeVisible();
    await expect(page.getByText("Payment terms in days")).toBeVisible();
  });

  test("finance page shows money owed, overdue, VAT records, and customer/job links", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const token = await getToken(page);
    const suffix = `${Date.now()}`;

    const settingsUpdate = await requestLocalApi(request, "/tenant/settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        vatEnabledDefault: true,
        vatRateBpsDefault: 2000,
        businessConfigJson: {
          finance: {
            vatNumber: `GB-VAT-${suffix}`,
            invoiceNumberPrefix: "INV",
            paymentTermsDays: 7,
            defaultVatCategory: "standard",
          },
        },
      },
    });
    expect(settingsUpdate.ok()).toBeTruthy();

    const job = await createCompletedJob(request, token, suffix);
    const issueInvoice = await requestLocalApi(request, `/billing/jobs/${job.id}/issue-invoice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(issueInvoice.ok()).toBeTruthy();

    const overdueDate = new Date();
    overdueDate.setUTCDate(overdueDate.getUTCDate() - 10);
    const patchDue = await requestLocalApi(request, `/jobs/${job.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        invoiceDueAt: overdueDate.toISOString(),
      },
    });
    expect(patchDue.ok()).toBeTruthy();

    await page.goto("/dashboard/finance", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByText(/Money owed/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finance summary" })).toBeVisible();
    await expect(page.getByText(/VAT|setup needed/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Customer balances" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invoice records" })).toBeVisible();
  });

  test("finance report records manual refunds and balance adjustments truthfully", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const token = await getToken(page);
    const suffix = `${Date.now()}-refund`;

    const job = await createCompletedJob(request, token, suffix);
    const issueInvoice = await requestLocalApi(request, `/billing/jobs/${job.id}/issue-invoice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(issueInvoice.ok()).toBeTruthy();

    const markPaid = await requestLocalApi(request, `/billing/jobs/${job.id}/mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(markPaid.ok()).toBeTruthy();

    const refund = await requestLocalApi(request, "/billing/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        jobId: job.id,
        amountCents: 1500,
        reason: "Customer goodwill credit",
        mode: "manual_record",
      },
    });
    expect(refund.ok()).toBeTruthy();

    const adjustment = await requestLocalApi(request, "/billing/adjustment", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        jobId: job.id,
        amountCents: 500,
        direction: "debit",
        reason: "Additional disposal fee",
      },
    });
    expect(adjustment.ok()).toBeTruthy();

    const reportResponse = await requestLocalApi(request, "/billing/finance-report", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(reportResponse.ok()).toBeTruthy();
    const report = await reportResponse.json();
    const invoice = report?.invoices?.find((entry: any) => entry.jobId === job.id);
    expect(invoice).toBeTruthy();
    expect(invoice.refundedAmountCents).toBe(1500);
    expect(invoice.adjustmentDebitCents).toBe(500);
    expect(invoice.status).toBe("partially_refunded");

    const refundAudit = await requestLocalApi(request, `/audit?type=billing.refund.record&pageSize=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(refundAudit.ok()).toBeTruthy();
    const refundAuditPayload = await refundAudit.json();
    expect((refundAuditPayload?.items || []).some((entry: any) => String(entry?.message || "").includes(job.jobRef))).toBeTruthy();

    const adjustmentAudit = await requestLocalApi(request, `/audit?type=billing.adjustment.record&pageSize=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(adjustmentAudit.ok()).toBeTruthy();
    const adjustmentAuditPayload = await adjustmentAudit.json();
    expect((adjustmentAuditPayload?.items || []).some((entry: any) => String(entry?.message || "").includes(job.jobRef))).toBeTruthy();
  });
});
