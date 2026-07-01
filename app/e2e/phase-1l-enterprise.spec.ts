import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, requestLocalApi } from "./utils";

const PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sQ8V6sAAAAASUVORK5CYII=";

async function login(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 1L enterprise operations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("platform-only job allowance controls feed tenant read-only billing summary", async ({ request }) => {
    const ownerToken = await login(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const platformToken = await login(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const me = await requestLocalApi(request, "/me", { headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(me.ok()).toBeTruthy();
    const tenantId = String((await me.json())?.companyId || "");
    expect(tenantId).toBeTruthy();

    const tenantDenied = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/job-allowance`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      data: { creditDelta: 1, reason: "E2E tenant should not update allowance", confirmation: true },
    });
    expect([401, 403]).toContain(tenantDenied.status());

    const update = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/job-allowance`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: {
        monthlyJobAllowance: 75,
        creditDelta: 3,
        temporaryCreditCount: 2,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        enterprisePlanNote: "E2E enterprise allowance override",
        reason: "E2E Phase 1L allowance control",
        confirmation: true,
      },
    });
    expect(update.ok()).toBeTruthy();
    const updateJson = await update.json();
    expect(updateJson.summary.monthlyIncludedAllowance).toBe(75);
    expect(updateJson.summary.manualCreditsTotal).toBeGreaterThanOrEqual(5);

    const billing = await requestLocalApi(request, "/billing/me", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(billing.ok()).toBeTruthy();
    const billingJson = await billing.json();
    expect(billingJson.jobCompletionAllowance.monthlyIncludedAllowance).toBe(75);
    expect(JSON.stringify(billingJson)).not.toContain("stripeProductId");
    expect(JSON.stringify(billingJson)).not.toContain("whsec_");
  });

  test("booking auto-confirm setting persists without exposing technician-specific public booking", async ({ request }) => {
    const token = await login(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const off = await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { autoConfirmPublicBookings: false },
    });
    expect(off.ok()).toBeTruthy();
    expect((await off.json()).autoConfirmPublicBookings).toBe(false);

    const on = await requestLocalApi(request, "/bookings/settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { autoConfirmPublicBookings: true },
    });
    expect(on.ok()).toBeTruthy();
    expect((await on.json()).autoConfirmPublicBookings).toBe(true);

    const config = await requestLocalApi(request, "/public/booking/e2e-booking-public-token/config");
    expect(config.ok()).toBeTruthy();
    const configJson = await config.json();
    expect(configJson.autoConfirmPublicBookings).toBe(true);
    expect(JSON.stringify(configJson)).not.toContain("sk_live_");
  });

  test("maps, media capacity, third-party share, and productivity use retained tenant data", async ({ request }) => {
    const token = await login(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const beforeMedia = Array.from({ length: 7 }).map((_, index) => ({
      data: PIXEL_DATA_URL,
      filename: `before-${index}.png`,
      mimeType: "image/png",
    }));
    const create = await requestLocalApi(request, "/jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        customerName: "Phase 1L Map Customer",
        customerEmail: "phase1l-map@example.test",
        serviceName: "Phase 1L evidence job",
        formData: {
          work_summary: "Phase 1L retained work summary",
          addressLine1: "1 Enterprise Way",
          city: "London",
          postcode: "SW1A 1AA",
          country: "UK",
        },
        beforeMedia,
      },
    });
    expect(create.ok()).toBeTruthy();
    const job = await create.json();
    const jobId = String(job?.id || job?.job?.id || "");
    expect(jobId).toBeTruthy();

    const detail = await requestLocalApi(request, `/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    const beforeAssets = (detailJson.assets || []).filter((asset: any) => asset.kind === "BEFORE");
    expect(beforeAssets.length).toBeGreaterThanOrEqual(7);

    const maps = await requestLocalApi(request, `/jobs/${jobId}/map-links`, { headers: { Authorization: `Bearer ${token}` } });
    expect(maps.ok()).toBeTruthy();
    const mapsJson = await maps.json();
    expect(mapsJson.liveTrackingEnabled).toBe(false);
    expect(mapsJson.customerDirections.googleMapsUrl).toContain("google.com/maps");
    expect(JSON.stringify(mapsJson)).not.toContain("GOOGLE_MAPS_API_KEY");

    const share = await requestLocalApi(request, `/jobs/${jobId}/share-job-sheet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        recipientEmail: "phase1l-third-party@example.test",
        includePdf: true,
        jobAssetIds: beforeAssets.slice(0, 2).map((asset: any) => asset.id),
        message: "Phase 1L safe third-party delivery test",
      },
    });
    expect(share.ok()).toBeTruthy();
    const shareJson = await share.json();
    expect(shareJson.selectedMedia).toBe(2);
    expect(["manifest_and_existing_pdf_link", "binary_attachments_captured", "binary_attachments", "binary_attachments_not_configured"]).toContain(shareJson.attachmentMode);
    expect(["captured", "not_configured", "sent", "deferred", "suppressed"]).toContain(shareJson.delivery.status);

    const productivity = await requestLocalApi(request, "/analytics/productivity?windowDays=30", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(productivity.ok()).toBeTruthy();
    const productivityJson = await productivity.json();
    expect(productivityJson.summary.forecasting).toBe("not_generated");
    expect(productivityJson.absenceContext.supportedTypes).toEqual(expect.arrayContaining(["holiday", "sickness", "paternity", "bereavement", "training"]));
  });
});
