import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("Phase 13 launch operations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running Phase 13 coverage.");

  test("Bookings language and public/trade links are clear and tenant scoped", async ({ page, request, context }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/booking/settings", { waitUntil: "networkidle" });

    await expect(page.getByRole("link", { name: "Bookings", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Requests", exact: true })).toHaveCount(0);
    const publicButton = page.getByTestId("open-public-booking-page");
    await expect(publicButton).toHaveAttribute("href", /\/portal\/booking\//);
    await expect(page.getByTestId("copy-public-booking-link")).toBeVisible();
    await expect(page.getByTestId("open-trade-booking-portal")).toHaveAttribute("href", /\/trade\/apply\//);
    await expect(page.getByTestId("copy-trade-portal-link")).toBeVisible();

    const publicPage = await Promise.all([
      context.waitForEvent("page"),
      publicButton.click(),
    ]).then(([nextPage]) => nextPage);
    await publicPage.waitForLoadState("domcontentloaded");
    await expect(publicPage.locator("body")).not.toContainText(/trade-only|internal service/i);
    await publicPage.close();
  });

  test("tenant numbering is atomic and archive periods retain and restore jobs and invoices", async ({ request }) => {
    const suffix = Date.now();
    const signup = await requestLocalApi(request, "/auth/signup", {
      method: "POST",
      data: {
        companyName: `Phase 13 ${suffix}`,
        email: `phase13-${suffix}@example.test`,
        password: "MyTitanPhase13!2026",
      },
    });
    expect(signup.ok()).toBeTruthy();
    const signupBody = await signup.json();
    const token = String(signupBody.token || "");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    for (const input of [
      { kind: "JOB_SHEET", prefix: "WA-", suffix: "", nextNumber: 1042, padding: 4 },
      { kind: "INVOICE", prefix: "INV-", suffix: "-A", nextNumber: 500, padding: 4 },
    ]) {
      const update = await requestLocalApi(request, "/tenant/document-numbering", {
        method: "PATCH",
        headers,
        data: { ...input, reason: "Continue from previous system" },
      });
      expect(update.ok()).toBeTruthy();
    }

    const createJob = (index: number) => requestLocalApi(request, "/jobs", {
      method: "POST",
      headers,
      data: {
        customerName: `Phase 13 Customer ${index}`,
        customerEmail: `phase13-customer-${suffix}-${index}@example.test`,
        serviceName: "Phase 13 service",
        completeAfterCreate: true,
      },
    });
    const [firstResponse, secondResponse] = await Promise.all([createJob(1), createJob(2)]);
    expect(firstResponse.ok()).toBeTruthy();
    expect(secondResponse.ok()).toBeTruthy();
    const first = await firstResponse.json();
    const second = await secondResponse.json();
    expect(new Set([first.jobRef, second.jobRef])).toEqual(new Set(["WA-1042", "WA-1043"]));

    const [firstInvoiceResponse, secondInvoiceResponse] = await Promise.all(
      [first.id, second.id].map((id) => requestLocalApi(request, `/billing/jobs/${id}/issue-invoice`, {
        method: "POST",
        headers,
        data: { paymentTermsDays: 14 },
      })),
    );
    expect(firstInvoiceResponse.ok()).toBeTruthy();
    expect(secondInvoiceResponse.ok()).toBeTruthy();
    const invoiceNumbers = new Set([
      (await firstInvoiceResponse.json()).invoiceNumber,
      (await secondInvoiceResponse.json()).invoiceNumber,
    ]);
    expect(invoiceNumbers).toEqual(new Set(["INV-0500-A", "INV-0501-A"]));

    const periodResponse = await requestLocalApi(request, "/jobs/archive-periods", {
      method: "POST",
      headers,
      data: {
        name: "2026 Q2",
        fromDate: "2026-04-01",
        toDate: "2026-06-30",
        scope: "JOBS_AND_INVOICES",
      },
    });
    expect(periodResponse.ok()).toBeTruthy();
    const period = await periodResponse.json();

    const archiveResponse = await requestLocalApi(request, "/jobs/archive-periods/archive-selected", {
      method: "POST",
      headers,
      data: { archivePeriodId: period.id, jobIds: [first.id, second.id] },
    });
    expect(archiveResponse.ok()).toBeTruthy();
    expect((await archiveResponse.json()).archived).toBe(2);

    const active = await requestLocalApi(request, "/jobs", { headers });
    expect((await active.json()).some((job: any) => [first.id, second.id].includes(job.id))).toBe(false);
    const archived = await requestLocalApi(request, "/jobs?includeArchived=true", { headers });
    const archivedRows = (await archived.json()).filter((job: any) => [first.id, second.id].includes(job.id));
    expect(archivedRows).toHaveLength(2);
    expect(archivedRows.every((job: any) => job.archivePeriod?.name === "2026 Q2")).toBe(true);

    const restore = await requestLocalApi(request, `/jobs/${first.id}/unarchive`, { method: "POST", headers, data: {} });
    expect(restore.ok()).toBeTruthy();
    expect(await restore.json()).toMatchObject({ id: first.id, archivedAt: null, archivePeriodId: null, jobRef: first.jobRef });
  });
});
