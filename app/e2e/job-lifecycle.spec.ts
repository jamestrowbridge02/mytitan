import { expect, test, type Page } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

const PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXS0AAAAASUVORK5CYII=";

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createJob(request: Parameters<typeof test>[0]["request"], token: string, uniqueId: string, options?: { complete?: boolean }) {
  const response = await requestLocalApi(request, "/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      customerName: `Lifecycle ${uniqueId}`,
      customerEmail: `lifecycle-${uniqueId}@example.test`,
      customerPhone: "01133001122",
      serviceName: "Lifecycle Job",
      tradeCode: "WHEELS",
      jobType: "Trade",
      completeAfterCreate: options?.complete === true,
      formData: options?.complete
        ? {
            jobReference: `LIFE-${uniqueId}`,
            jobDate: "2026-04-25",
            jobType: "Trade",
            serviceName: "Lifecycle Job",
            customerName: `Lifecycle ${uniqueId}`,
            customerEmail: `lifecycle-${uniqueId}@example.test`,
            customerPhone: "01133001122",
            technicianName: "Playwright Technician",
            technicianSignatureName: "Playwright Technician",
            technicianSignature: PIXEL_DATA_URL,
            customerSignatureName: "Playwright Customer",
            customerSignature: PIXEL_DATA_URL,
          }
        : undefined,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload?.created || payload;
}

async function issueInvoice(request: Parameters<typeof test>[0]["request"], token: string, jobId: string) {
  const response = await requestLocalApi(request, `/billing/jobs/${jobId}/issue-invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function patchJobStatus(request: Parameters<typeof test>[0]["request"], token: string, jobId: string, status: string) {
  const response = await requestLocalApi(request, `/jobs/${jobId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { status },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("job lifecycle", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("archive, unarchive, cancel, and soft delete stay authoritative", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const uniqueId = `${Date.now()}`;

    const completedJob = await createJob(request, token, `${uniqueId}-completed`, { complete: true });
    await issueInvoice(request, token, completedJob.id);
    const markPaid = await requestLocalApi(request, `/billing/jobs/${completedJob.id}/mark-paid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(markPaid.ok()).toBeTruthy();

    const archiveResponse = await requestLocalApi(request, `/jobs/${completedJob.id}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(archiveResponse.ok()).toBeTruthy();

    const defaultList = await requestLocalApi(request, "/jobs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const defaultJobs = await defaultList.json();
    expect(Array.isArray(defaultJobs)).toBeTruthy();
    expect(defaultJobs.some((job: any) => job.id === completedJob.id)).toBeFalsy();

    const archivedList = await requestLocalApi(request, "/jobs?includeArchived=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const archivedJobs = await archivedList.json();
    const archivedEntry = archivedJobs.find((job: any) => job.id === completedJob.id);
    expect(archivedEntry?.archivedAt).toBeTruthy();

    const unarchiveResponse = await requestLocalApi(request, `/jobs/${completedJob.id}/unarchive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(unarchiveResponse.ok()).toBeTruthy();

    const cancelledJob = await createJob(request, token, `${uniqueId}-cancel`);
    const cancelResponse = await requestLocalApi(request, `/jobs/${cancelledJob.id}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { reason: "Playwright cancellation" },
    });
    expect(cancelResponse.ok()).toBeTruthy();
    const cancelledPayload = await cancelResponse.json();
    expect(cancelledPayload?.status).toBe("CANCELLED");

    const deletableJob = await createJob(request, token, `${uniqueId}-delete`);
    const deleteResponse = await requestLocalApi(request, `/jobs/${deletableJob.id}/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.ok()).toBeTruthy();

    const deletedDetail = await requestLocalApi(request, `/jobs/${deletableJob.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deletedDetail.status()).toBe(404);
  });

  test("archived jobs stay out of the default queue and remain recoverable from detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const uniqueId = `${Date.now()}-queue`;

    await createJob(request, token, `${uniqueId}-active`);
    await createJob(request, token, `${uniqueId}-done`, { complete: true });
    const archivedJob = await createJob(request, token, `${uniqueId}-archive`, { complete: true });
    await issueInvoice(request, token, archivedJob.id);
    const archiveResponse = await requestLocalApi(request, `/jobs/${archivedJob.id}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(archiveResponse.ok()).toBeTruthy();

    await page.goto("/dashboard/jobs");
    if (await page.getByTestId("location-scope-switcher").count()) {
      await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    }
    await page.getByPlaceholder("Search job ref, customer, reg, service, or owner").fill(uniqueId);

    await expect(page.getByTestId(`job-row-${archivedJob.id}`)).toHaveCount(0);

    await page.goto(`/dashboard/jobs/${archivedJob.id}`);
    const lifecycleSummary = page.locator("summary").filter({ hasText: "View lifecycle controls" });
    if (await lifecycleSummary.isVisible().catch(() => false)) {
      await lifecycleSummary.click();
    }
    await expect(page.getByTestId("job-lifecycle-controls")).toContainText(/archive hides this job from daily work/i);
    await expect(page.getByTestId("job-lifecycle-controls")).toContainText(/Unarchive job/i);
  });
});
