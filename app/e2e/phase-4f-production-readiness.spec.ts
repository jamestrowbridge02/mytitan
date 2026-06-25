import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("phase 4F production readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("offline field execution supports production queues and dedicated technician review", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    const response = await requestLocalApi(request, "/enterprise/phase-1k/offline/packet", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const packet = await response.json();
    expect(packet.scope).toBe("assigned_jobs_only");
    expect(packet.queueMonitoring.visibleRoute).toBe("/dashboard/technician/offline");
    expect(packet.completionGuarantee.queuedEvidenceTypes).toEqual(expect.arrayContaining(["before_photo", "after_photo", "video", "document", "signature", "payment_evidence"]));
    expect(packet.binaryQueuePolicy.acceptedMimeTypes).toEqual(expect.arrayContaining(["video/mp4", "application/pdf", "image/jpeg"]));
    expect(packet.retryStrategy.available).toBe(true);
    expect(packet.partialSyncRecovery.conflictsRequireReview).toBe(true);
    expect(packet.failedUploadRecovery.preservesLocalEvidenceUntilUserClears).toBe(true);
    expect(packet.cachePolicy.fullAuthenticatedAppCaching).toBe(false);
    expect(packet.cachePolicy.storesSecrets).toBe(false);
    expect(packet.binaryQueuePolicy.storesSecrets).toBe(false);
    expect(JSON.stringify(packet)).not.toMatch(/refresh_token|access_token|client_secret|smtp|STRIPE_SECRET_KEY|whsec_/i);

    await page.goto("/dashboard/technician/offline", { waitUntil: "networkidle" });
    await expect(page.getByTestId("technician-offline-control-room")).toBeVisible();
    await expect(page.getByTestId("offline-safety-contract")).toContainText(/Assigned jobs only|No full app cache|Local evidence protected|Recovery ready/i);
    await expect(page.getByTestId("offline-queue-review")).toContainText(/Photos, videos, documents, signatures, materials, completion notes, and manual payment notes/i);
  });

  test("live provider control room exposes gated sync health without provider mutation", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const response = await requestLocalApi(request, "/enterprise/phase-1k/sync/control-room", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const control = await response.json();
    expect(control.scope).toBe("tenant_sync_control_room");
    expect(control.liveSyncGlobalEnabled).toBe(false);
    expect(control.liveProviderMutation).toBe(false);
    expect(control.sections.accounting.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["xero", "quickbooks"]));
    expect(control.sections.calendar.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["google_calendar", "microsoft_calendar", "apple_ical"]));
    expect(control.sections.email.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["gmail", "outlook"]));
    for (const row of [...control.sections.accounting, ...control.sections.calendar, ...control.sections.email]) {
      expect(row).toEqual(expect.objectContaining({
        oauthStatus: expect.any(String),
        tokenExpiryStatus: expect.any(String),
        reconnectState: expect.any(String),
        syncHealth: expect.any(String),
        failedSyncQueue: expect.any(Array),
        conflictQueue: expect.any(Array),
        retryQueue: expect.any(Array),
        tokensReturnedToFrontend: false,
      }));
      if (row.liveSyncEnabled) {
        expect(row.tenantOwnedOAuthVerified).toBe(true);
        expect(row.explicitLiveFlagEnabled).toBe(true);
      }
    }
    expect(JSON.stringify(control)).not.toMatch(/refresh_token|access_token|client_secret|smtpPassword|STRIPE_SECRET_KEY|whsec_/i);

    await page.goto("/dashboard/integrations#sync-control-room", { waitUntil: "networkidle" });
    await expect(page.getByTestId("integrations-workspace-section")).toBeVisible();
    await expect(page.getByTestId("sync-control-room")).toHaveCount(0);
    await expect(page.getByTestId("sync-control-provider-apple_ical")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Sync health|Expiry|Failed:|read only feed export/i);
  });

  test("business health v2 is tenant-only, location-first, and links KPIs to source data", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const response = await requestLocalApi(request, "/metrics/business-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const health = await response.json();
    expect(health.scope || health.source).toBeTruthy();
    expect(health.platformDiagnosticsVisible).toBe(false);
    expect(health.summary).toEqual(expect.objectContaining({
      revenueTrend: expect.any(Object),
      marginTrend: expect.objectContaining({ available: false }),
      bookingConversion: expect.any(Object),
      reviewPerformance: expect.any(Object),
      customerRetention: expect.any(Object),
      collectionPerformance: expect.any(Object),
      sourceLinks: expect.any(Object),
    }));
    expect(health.locations.length).toBeGreaterThan(0);
    expect(health.locations[0]).toEqual(expect.objectContaining({
      workload: expect.any(Number),
      revenueCents: expect.any(Number),
      completionVelocity: expect.any(Number),
      capacity: expect.any(Object),
      staffingPressure: expect.any(String),
    }));

    await page.goto("/dashboard/intelligence", { waitUntil: "networkidle" });
    await expect(page.getByTestId("business-health-engine")).toBeVisible();
    const kpis = page.locator('[data-testid^="business-health-kpi-"]');
    await expect(kpis.first()).toBeVisible({ timeout: 20_000 });
    const count = await kpis.count();
    for (let index = 0; index < count; index += 1) {
      await expect(kpis.nth(index)).toHaveAttribute("href", /\/dashboard\//);
    }
  });

  test("media governance v2 exposes folders, search, tagging, retention, and export readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const response = await requestLocalApi(request, "/artifacts/governance", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const governance = await response.json();
    expect(governance.scope).toBe("tenant_media_governance");
    expect(governance.platformDiagnosticsVisible).toBe(false);
    expect(governance.folderTaxonomy.map((row: any) => row.folder)).toEqual(expect.arrayContaining([
      "before-photos",
      "after-photos",
      "videos",
      "signatures",
      "compliance",
      "invoices",
      "payment-evidence",
      "torque-evidence",
      "supplier-documents",
      "warranty-documents",
    ]));
    expect(governance.search.enabled).toBe(true);
    expect(governance.tagging.enabled).toBe(true);
    expect(governance.retentionPolicy.exportPolicy).toBeTruthy();
    expect(governance.destructiveActions.deleteWithoutExplicitAction).toBe(false);
    expect(governance.destructiveActions.auditRequired).toBe(true);
  });

  test("workflow automation and self-healing stay safe while external uptime remains excluded from tenant concerns", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    const workflowResponse = await requestLocalApi(request, "/enterprise/phase-1k/workflow-engine", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(workflowResponse.ok()).toBeTruthy();
    const workflow = await workflowResponse.json();
    expect(workflow.scope).toBe("tenant_workflow_automation_engine");
    expect(workflow.guarantees.duplicateCreationBlocked).toBe(true);
    expect(workflow.guarantees.liveProviderMutation).toBe(false);
    expect(workflow.rules.map((rule: any) => rule.key)).toEqual(expect.arrayContaining([
      "booking_created_create_job",
      "job_completed_draft_invoice",
      "invoice_paid_request_review",
      "customer_inactive_winback",
    ]));
    for (const rule of workflow.rules) {
      expect(rule.tenantConfigurable).toBe(true);
      expect(rule.audited).toBe(true);
      expect(rule.reversible).toBe(true);
      expect(rule.idempotent).toBe(true);
      expect(rule.href).toMatch(/^\/dashboard\//);
    }

    const healthResponse = await requestLocalApi(request, "/tenant/account-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(healthResponse.ok()).toBeTruthy();
    const health = await healthResponse.json();
    expect(health.scope).toBe("tenant_account_health");
    expect(health.platformDiagnosticsVisible).toBe(false);
    const body = JSON.stringify(health).toLowerCase();
    expect(body).not.toContain("external uptime");
    expect(body).not.toContain("external_monitor");
    for (const issue of health.issues) {
      expect(issue.actionHref).toMatch(/^\/dashboard\//);
      if (["accounting_reconnect_needed", "calendar_reconnect_needed", "email_sync_paused", "media_storage_near_limit", "deposit_required_provider_readiness"].includes(issue.key)) {
        expect(issue.autoFixAvailable).toBe(false);
      }
    }
  });
});
