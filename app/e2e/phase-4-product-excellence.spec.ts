import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, requestLocalApi } from "./utils";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

function expectNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("access_token");
  expect(serialized).not.toContain("refresh_token");
  expect(serialized).not.toContain("client_secret");
  expect(serialized).not.toContain("smtp://");
  expect(serialized).not.toContain("sk_live_");
  expect(serialized).not.toContain("sk_test_");
  expect(serialized).not.toContain("whsec_");
}

test.describe("Phase 4 product excellence", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("overview exposes product state without fake AI, fake routing, Stripe mutation, or secret leakage", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-4/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.stage).toBe("phase_4_product_excellence");
    expect(body.truthContract).toMatchObject({
      fakeAi: false,
      fakeForecasting: false,
      fakeRouting: false,
      fakeUptime: false,
      stripeMutation: false,
      secretExposure: false,
      weakensRbac: false,
      tenantIsolationRegression: false,
    });
    expect(body.platformTenantRecheck.platformInternalsReturned).toBe(false);
    expect(body.billingSecurityRecheck.stripeMutation).toBe(false);
    expect(body.billingSecurityRecheck.secretsReturnedToClient).toBe(false);
    expectNoSecrets(body);
  });

  test("record authority, lifecycle automation, and portal hub use retained tenant records", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-4/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.designSystemV2.status).toBe("v2_unified");
    expect(body.designSystemV2.primitives).toEqual(expect.arrayContaining(["workflow_header", "kpi_card", "data_table", "form_field", "empty_state", "error_state", "modal"]));

    expect(body.lifecycleAutomation.supportedModes).toEqual(expect.arrayContaining(["manual", "semi_automatic", "fully_automatic"]));
    expect(body.lifecycleAutomation.transitions.map((item: any) => item.key)).toEqual(expect.arrayContaining([
      "booking_created",
      "job_created",
      "location_assigned",
      "technician_assigned",
      "reminder_sent_or_queued",
      "work_completed",
      "invoice_payment_created",
      "review_request_generated",
    ]));
    for (const transition of body.lifecycleAutomation.transitions) {
      expect(transition.audited).toBe(true);
      expect(transition.idempotent).toBe(true);
      expect(transition.reversible).toBe(true);
      expect(transition.count).toBeGreaterThanOrEqual(0);
    }

    expect(body.recordKeeping.status).toBe("single_completed_job_timeline");
    expect(body.recordKeeping.permanentRecordPolicy).toContain("tenant_scoped");
    expect(body.recordKeeping.coverage.documentArtifacts).toBeGreaterThanOrEqual(0);
    expect(body.recordKeeping.coverage.evidenceItems).toBeGreaterThanOrEqual(0);

    expect(body.customerPortal.status).toBe("customer_hub");
    expect(body.customerPortal.supportedSurfaces).toEqual(expect.arrayContaining(["bookings", "eta", "status", "invoices", "payments", "completed_work", "photos", "documents", "warranty_history", "review_requests", "communications_timeline"]));
    expect(body.customerPortal.evidence.portalVisibleDocuments).toBeGreaterThanOrEqual(0);
  });

  test("maps, offline mode, forecasting, acquisition, trust, and performance stay truthful", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-4/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    expect(body.mapsRouting.liveTrackingEnabled).toBe(false);
    expect(body.mapsRouting.gpsClaimEnabled).toBe(false);
    expect(body.mapsRouting.automaticRouteMutation).toBe(false);
    expect(body.mapsRouting.providers.appleMaps.ready).toBe(true);
    expect(body.mapsRouting.providers.waze.ready).toBe(true);
    expect(body.mapsRouting.routePreview.length).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(body.mapsRouting)).not.toContain("GOOGLE_MAPS_API_KEY");

    expect(body.offlineMode.scope).toBe("assigned_jobs_only");
    expect(body.offlineMode.fullAppCaching).toBe(false);
    expect(body.offlineMode.storesSecrets).toBe(false);
    expect(body.offlineMode.storesTokens).toBe(false);
    expect(body.offlineMode.supportedActions).toEqual(expect.arrayContaining(["view_assigned_jobs_offline", "complete_jobs_offline", "capture_photos_offline", "capture_signatures_offline", "add_materials_offline", "record_payments_offline", "retry_queue", "conflict_resolution", "sync_recovery"]));

    expect(body.forecasting.realDataOnly).toBe(true);
    expect(body.forecasting.noFabricatedPredictions).toBe(true);
    expect(body.forecasting.assumptions.join(" ")).toContain("No model call");
    expect(body.forecasting.metrics.revenue.source).toBe("average_recent_job_revenue");
    expect(["insufficient_data", "low", "medium", "high"]).toContain(body.forecasting.metrics.revenue.confidence);

    expect(body.customerAcquisition.safety.optOutRequired).toBe(true);
    expect(body.customerAcquisition.safety.rateLimitsRequired).toBe(true);
    expect(body.customerAcquisition.channels.map((item: any) => item.key)).toEqual(expect.arrayContaining(["review_automation", "google_review_prompts", "abandoned_booking_recovery", "rebooking_reminders", "seasonal_reminders", "win_back_campaigns", "lead_attribution", "conversion_tracking"]));

    expect(body.productTrust.status).toBe("no_dead_ends");
    for (const item of body.productTrust.items) {
      expect(item.issue).toBeTruthy();
      expect(item.impact).toBeTruthy();
      expect(item.fix).toBeTruthy();
      expect(item.action).toBeTruthy();
    }
    expect(body.performance.budgets.avoidFullAppOfflineCache).toBe(true);
    expect(body.performance.optimisations).toEqual(expect.arrayContaining(["bounded_api_queries", "no_provider_calls_on_overview", "no_binary_in_offline_packet"]));
  });

  test("support mode requires tenant selection, reason, audit record, and timed access", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-4/support-mode", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("audited_timed_access_contract");
    expect(body.tenantSelectionRequired).toBe(true);
    expect(body.reasonRequired).toBe(true);
    expect(body.auditRecordRequired).toBe(true);
    expect(body.timedAccessRequired).toBe(true);
    expect(body.platformInternalsVisibleToTenant).toBe(false);
    expect(body.accidentalTenantDataAccessGuard).toContain("tenant_must_be_selected");
    expectNoSecrets(body);
  });
});
