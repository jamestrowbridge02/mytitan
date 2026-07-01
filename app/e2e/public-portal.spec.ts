import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, readMetadata, requestLocalApi } from "./utils";

const metadata = readMetadata();
const portalToken = process.env.PLAYWRIGHT_PUBLIC_PORTAL_TOKEN || (hasDashboardAuth() ? fixtureRefs.portalToken : metadata.portalToken);

async function loginAndGetToken(request: any) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    data: { email: defaultOperatorEmail, password: defaultOperatorPassword },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

test.describe("public portal workflow", () => {
  test.skip(!portalToken, "Set PLAYWRIGHT_PUBLIC_PORTAL_TOKEN or provide dashboard auth credentials so global setup can mint a portal token.");

  test("public portal exposes billing guidance and safe async controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByTestId("public-portal-billing-progress")).toBeVisible();
    await expect(page.getByTestId("public-portal-handoff-status")).toBeVisible();
    await expect(page.getByTestId("public-portal-next-step")).toBeVisible();
    await expect(page.getByText(/Billing and payment/i)).toBeVisible();
    await expect(page.getByTestId("public-portal-handoff-status")).toContainText(/waiting for scope confirmation|waiting for approval|waiting for signature|service record ready|waiting for payment|closed and paid/i);

    const refreshButton = page.getByTestId("public-portal-refresh-payment");
    if (await refreshButton.count()) {
      await page.route(/\/public\/job\/.+\/payment-status/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      }, { times: 1 });
      await refreshButton.click();
      await expect(refreshButton).toBeDisabled();
      await expect(refreshButton).toHaveText(/Refreshing/i);
    } else {
      await expect(page.getByTestId("public-portal-billing-progress")).toContainText(/Billing and payment|Pay here/i);
      await expect(page.getByText(/business payment setup|payment is handled by the business|customer payments are handled/i).first()).toBeVisible();
    }

    const approveButton = page.getByTestId("public-portal-approve");
    if (await approveButton.count()) {
      await page.route(/\/public\/job\/.+\/approve/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      }, { times: 1 });
      await approveButton.click();
      await expect(approveButton).toBeDisabled();
      await expect(page.getByTestId("public-portal-decline")).toBeDisabled();
    }
  });

  test("public portal shows customer-safe completion proof", async ({ page, request }) => {
    await installApiProxy(page, request);
    const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/public/job/${portalToken}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByText(/Documents and downloads/i)).toBeVisible();
    await expect(page.getByText(/This is your completed work/i)).toBeVisible();
    const completionProof = page.getByTestId("public-portal-completion-proof");
    if (await completionProof.count()) {
      await expect(completionProof).toBeVisible();
      await expect(completionProof.getByText(fixtureRefs.seededPortalArtifactLabel).first()).toBeVisible();
    } else {
      await expect(page.getByText(fixtureRefs.seededPortalArtifactLabel).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Service summary", exact: true })).toBeVisible();
    await expect(page.getByTestId("public-portal-documents")).toBeVisible();
    if (Array.isArray(body?.portal?.documents) && body.portal.documents.some((item: any) => item?.downloadUrl)) {
      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible();
    }
  });

  test("public portal shows scoped work history and booking guidance", async ({ page, request }) => {
    await installApiProxy(page, request);
    const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/public/job/${portalToken}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByTestId("public-portal-work-history")).toBeVisible();
    const firstHistoryJobRef = body?.portal?.workHistory?.jobs?.[0]?.jobRef;
    if (firstHistoryJobRef) {
      await expect(page.getByTestId("public-portal-work-history")).toContainText(String(firstHistoryJobRef));
    }
    await expect(page.getByTestId("public-portal-booking")).toBeVisible();

    const booking = body?.portal?.booking || null;
    if (booking?.enabled && booking?.bookingUrl) {
      const bookingPath = new URL(String(booking.bookingUrl)).pathname + new URL(String(booking.bookingUrl)).search;
      await page.goto(bookingPath);
      await expect(page.getByTestId("public-booking-brand-header")).toBeVisible();
      await expect(page.getByTestId("public-booking-location-page")).toBeVisible();
      await expect(page.getByTestId("public-booking-summary")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("public-portal-booking")).toContainText(/not enabled|unavailable|no open appointment slots/i);
    }
  });

  test("public portal shows customer journey and truthful ETA without GPS or routes", async ({ page, request }) => {
    await installApiProxy(page, request);
    const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/public/job/${portalToken}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body?.portal?.journey?.enabled).toBeTruthy();
    expect(body?.portal?.journey?.eta?.precisionNotice).toMatch(/GPS tracking is not used/i);
    expect(JSON.stringify(body)).not.toMatch(/latitude|longitude|coordinates|polyline|routeGeometry|supplierSku|Stripe secret/i);

    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByTestId("public-portal-journey")).toBeVisible();
    await expect(page.getByTestId("public-portal-journey")).toContainText(/Appointment window|Expected between/i);
    await expect(page.getByTestId("public-portal-journey")).toContainText(/Technician assigned|Technician/i);
    await expect(page.getByTestId("public-portal-journey")).toContainText(/Live GPS tracking is not used|No technician location/i);
    await expect(page.getByTestId("public-portal-journey-timeline")).toContainText(/Booking received|Scheduled|Completed/i);
    await expect(page.getByTestId("public-portal-journey")).not.toContainText(/latitude|longitude|GPS coordinates/i);
  });

  test("operator ETA updates are audited, customer-safe, and route preview is informational", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAndGetToken(request);
    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const beforeJob = await requestLocalApi(request, `/jobs/${fixtureRefs.portalActiveJobId}`, { headers: authHeaders });
    expect(beforeJob.ok()).toBeTruthy();
    const beforeBody = await beforeJob.json();
    const originalScheduledAt = beforeBody.scheduledAt;

    const delayed = await requestLocalApi(request, `/jobs/${fixtureRefs.portalActiveJobId}/customer-journey`, {
      method: "PATCH",
      headers: authHeaders,
      data: {
        etaStatus: "DELAYED",
        confidence: "delayed",
        etaWindowStart: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        etaWindowEnd: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
        customerFacingStatus: "Running approximately 20 minutes behind schedule.",
        note: "Running approximately 20 minutes behind schedule.",
        showTechnicianName: true,
      },
    });
    expect(delayed.ok()).toBeTruthy();
    const delayedBody = await delayed.json();
    expect(delayedBody.eta.status).toBe("DELAYED");

    const onRoute = await requestLocalApi(request, `/jobs/${fixtureRefs.portalActiveJobId}/customer-journey`, {
      method: "PATCH",
      headers: authHeaders,
      data: {
        stage: "ON_ROUTE",
        etaStatus: "ON_ROUTE",
        confidence: "manual_update",
        customerFacingStatus: "The technician is on route.",
        note: "The technician is on route.",
      },
    });
    expect(onRoute.ok()).toBeTruthy();

    const routePreview = await requestLocalApi(request, `/jobs/route-preview/customer-eta?date=${encodeURIComponent(String(originalScheduledAt).slice(0, 10))}`, {
      headers: authHeaders,
    });
    expect(routePreview.ok()).toBeTruthy();
    const routeBody = await routePreview.json();
    expect(routeBody.informationalOnly).toBeTruthy();
    expect(routeBody.mutatesSchedule).toBeFalsy();
    expect(routeBody.usesGps).toBeFalsy();
    expect(JSON.stringify(routeBody)).not.toMatch(/latitude|longitude|polyline|routeGeometry/i);

    const afterJob = await requestLocalApi(request, `/jobs/${fixtureRefs.portalActiveJobId}`, { headers: authHeaders });
    expect(afterJob.ok()).toBeTruthy();
    expect((await afterJob.json()).scheduledAt).toBe(originalScheduledAt);

    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByTestId("public-portal-journey")).toContainText(/on route|technician is on route/i);

    const audit = await requestLocalApi(request, "/audit", { headers: authHeaders });
    expect(audit.ok()).toBeTruthy();
    expect(JSON.stringify(await audit.json())).toContain("customer_eta.update");
  });

  test("public portal rejects invalid access tokens", async ({ request }) => {
    const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/public/job/not-a-real-portal-token`);
    expect(response.status()).toBe(404);
  });
});
