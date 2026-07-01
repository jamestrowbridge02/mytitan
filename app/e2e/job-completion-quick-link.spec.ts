import { expect, test } from "@playwright/test";

import { fixtureRefs, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function authHeaders(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return {
    Authorization: `Bearer ${String(body?.token || "")}`,
    "Content-Type": "application/json",
  };
}

async function drawSignature(page: any, testId: string) {
  const signaturePad = page.getByTestId(testId);
  await expect(signaturePad).toBeVisible();
  await signaturePad.hover();
  await page.mouse.down();
  await page.mouse.move(50, 30);
  await page.mouse.move(150, 70);
  await page.mouse.up();
}

test.describe("job completion quick links", () => {
  test("completion quick link stays scoped to one job sheet and writes into the canonical execution record", async ({ page, request, context }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/jobs/${fixtureRefs.technicianJobId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("job-completion-link-card")).toBeVisible();
    await page.getByTestId("job-create-completion-link").click();
    await expect(page.getByTestId("job-generated-completion-link")).toBeVisible();

    const quickLink = await page.getByTestId("job-generated-completion-link-input").inputValue();
    expect(quickLink).toContain("/complete/job/");
    const localQuickLink = new URL(quickLink).pathname;

    const completionPage = await context.newPage();
    await installApiProxy(completionPage, request);
    await completionPage.goto(localQuickLink, { waitUntil: "networkidle" });

    await expect(completionPage.getByTestId("job-completion-quick-link-page")).toBeVisible();
    await expect(completionPage.getByText(/quick link status/i)).toBeVisible();
    await completionPage.getByTestId("job-completion-summary").fill("Wheel service completed on the device handoff flow.");
    const firstChecklistCheckbox = completionPage.locator('[data-testid="job-completion-checklist"] input[type="checkbox"]').first();
    await firstChecklistCheckbox.check();
    await completionPage.getByTestId("job-completion-notes").fill("Tyre pressures confirmed and customer shown the finished work.");
    await completionPage.getByTestId("job-completion-evidence-note").fill("Photo set captured on the field device.");
    await completionPage.getByTestId("job-completion-signature-name").fill("Taylor Tech");
    await drawSignature(completionPage, "job-completion-signature-pad");
    await completionPage.getByTestId("job-completion-submit").click();
    await expect(completionPage.getByText("Completion submitted to the main job sheet.")).toBeVisible();

    const operatorHeaders = await authHeaders(request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    const executionResponse = await requestLocalApi(request, `/jobs/${fixtureRefs.technicianJobId}/execution`, { headers: operatorHeaders });
    expect(executionResponse.ok()).toBeTruthy();
    const executionBody = await executionResponse.json();
    expect(executionBody?.record?.status).toBe("SUBMITTED");
    expect(executionBody?.record?.summary).toContain("device handoff");
    expect(Array.isArray(executionBody?.record?.evidence)).toBeTruthy();
    expect(executionBody.record.evidence.some((item: any) => item.kind === "SIGNATURE")).toBeTruthy();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("execution-record-card")).toContainText("Wheel service completed on the device handoff flow.");
  });

  test("quick-link generation stays blocked for viewer roles and invalid public tokens stay rejected", async ({ page, request }) => {
    const viewerHeaders = await authHeaders(request, "e2e.viewer@mytitan.local", "MyTitanE2EViewer!2026");
    const blocked = await requestLocalApi(request, `/jobs/${fixtureRefs.technicianJobId}/completion-link`, {
      method: "POST",
      headers: viewerHeaders,
      data: "{}",
    });
    expect(blocked.status()).toBe(403);

    await installApiProxy(page, request);
    const response = await page.goto("/complete/job/not-a-real-completion-token", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/could not open this completion link|completion link not found|expired/i)).toBeVisible();
  });
});
