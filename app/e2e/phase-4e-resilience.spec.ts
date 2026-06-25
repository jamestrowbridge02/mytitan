import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("phase 4E offline sync and portal resilience", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("offline packet supports full assigned-job field workflow without secrets or blind overwrite", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    const packetResponse = await requestLocalApi(request, "/enterprise/phase-1k/offline/packet", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(packetResponse.ok()).toBeTruthy();
    const packet = await packetResponse.json();
    expect(packet.scope).toBe("assigned_jobs_only");
    expect(packet.fieldOperation.supportedActions).toEqual(expect.arrayContaining(["start_job", "mark_complete_pending_sync", "resolve_conflicts"]));
    expect(packet.cachePolicy.fullAuthenticatedAppCaching).toBe(false);
    expect(packet.binaryQueuePolicy.storesTokens).toBe(false);
    expect(packet.binaryQueuePolicy.storesSecrets).toBe(false);
    expect(packet.conflictResolution.every((item: any) => item.overwritesBlindly === false)).toBeTruthy();
    expect(JSON.stringify(packet)).not.toMatch(/refresh_token|access_token|smtp|STRIPE_SECRET_KEY|whsec_/i);

    const jobId = String(packet.jobs?.[0]?.id || fixtureRefs.technicianJobId);
    const conflictResponse = await requestLocalApi(request, "/enterprise/phase-1k/offline/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        mutations: [{
          clientMutationId: "phase4e-stale-complete",
          jobId,
          type: "status_change",
          baseVersion: "2000-01-01T00:00:00.000Z",
          payload: { status: "COMPLETED", pendingSync: true },
        }],
      },
    });
    expect(conflictResponse.ok()).toBeTruthy();
    const conflict = await conflictResponse.json();
    expect(conflict.results[0].state).toBe("conflict");
    expect(conflict.results[0].conflict.overwritesBlindly).toBe(false);
    expect(conflict.results[0].conflict.safeOptions).toContain("review server changes");

    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });
    await expect(page.getByTestId("offline-mobile-foundation")).toContainText(/usable offline|server remains source of truth/i);
    await expect(page.getByTestId("offline-conflict-resolution-options")).toContainText(/no blind overwrite/i);
    await expect(page.locator('[data-testid^="offline-queue-complete-"]').first()).toBeVisible();
  });

  test("live sync control room stays tenant-owned, dry-run first, and token-free", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const response = await requestLocalApi(request, "/enterprise/phase-1k/sync/control-room", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const control = await response.json();
    expect(control.scope).toBe("tenant_sync_control_room");
    expect(control.platformDiagnosticsVisible).toBe(false);
    expect(control.liveSyncGlobalEnabled).toBe(false);
    expect(control.liveProviderMutation).toBe(false);
    expect(control.tokensReturnedToFrontend).toBe(false);
    expect(control.sections.accounting.length).toBeGreaterThanOrEqual(2);
    expect(control.sections.calendar.length).toBeGreaterThanOrEqual(2);
    expect(control.sections.email.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["gmail", "outlook"]));
    expect(JSON.stringify(control)).not.toMatch(/refresh_token|access_token|client_secret|smtpPassword|STRIPE_SECRET_KEY|whsec_/i);

    await page.goto("/dashboard/integrations?section=sync-control-room", { waitUntil: "networkidle" });
    await expect(page.getByTestId("integrations-workspace-section")).toBeVisible();
    await expect(page.getByTestId("sync-control-room")).toHaveCount(0);
    await expect(page.getByTestId("sync-control-provider-xero")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Live provider mutation blocked|tokens returned/i);
  });

  test("media governance is tenant scoped and never deletes without explicit action", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const response = await requestLocalApi(request, "/artifacts/governance", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const governance = await response.json();
    expect(governance.scope).toBe("tenant_media_governance");
    expect(governance.platformDiagnosticsVisible).toBe(false);
    expect(governance.destructiveActions.deleteWithoutExplicitAction).toBe(false);
    expect(governance.destructiveActions.archiveWithoutExplicitAction).toBe(false);
    expect(governance.destructiveActions.auditRequired).toBe(true);
    expect(Array.isArray(governance.byFolder)).toBeTruthy();
    expect(JSON.stringify(governance)).not.toMatch(/private-user-images|STRIPE_SECRET_KEY|whsec_/i);

    await page.goto(`/dashboard/jobs/${fixtureRefs.invoiceReadyJobId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("media-governance-job")).toBeVisible();
    await expect(page.getByTestId("media-governance-job")).toContainText(/no automatic delete: yes/i);
  });

  test("customer portal hub respects customer-safe language and self-service controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    const response = await request.get(`http://127.0.0.1:3000/public/job/${fixtureRefs.portalToken}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.portal.enabled).toBeTruthy();
    expect(body.portal.controls).toBeTruthy();

    await page.goto(`/portal/job/${fixtureRefs.portalToken}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("public-portal-self-service-hub")).toBeVisible();
    await expect(page.getByTestId("public-portal-self-service-hub")).toContainText(/Active status|Booking history|ETA window|Invoices and receipts/i);
    await expect(page.getByTestId("public-portal-contact-business")).toBeVisible();
    await expect(page.getByTestId("public-portal-self-service-hub")).not.toContainText(/platform admin|private note|internal host|GPS coordinates/i);
    await expect(page.locator("body")).not.toContainText(/fake tracking|MyTitan Stripe/i);
  });

  test("expanded account health offers safe actions for sync, media, portal, and evidence issues", async ({ request, page }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/tenant/account-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const health = await response.json();
    expect(health.platformDiagnosticsVisible).toBe(false);
    expect(JSON.stringify(health)).not.toMatch(/STRIPE_SECRET_KEY|whsec_|refresh_token|access_token/i);
    const knownKeys = health.issues.map((issue: any) => issue.key);
    expect(knownKeys).toEqual(expect.arrayContaining(["billing_contact_missing"]));
    for (const issue of health.issues.filter((item: any) => ["accounting_reconnect_needed", "calendar_reconnect_needed", "email_sync_paused", "media_storage_near_limit", "portal_enabled_booking_disabled", "completed_job_missing_required_evidence"].includes(item.key))) {
      expect(issue.autoFixAvailable).toBe(false);
      expect(issue.actionHref).toMatch(/^\/dashboard\//);
    }
  });
});
