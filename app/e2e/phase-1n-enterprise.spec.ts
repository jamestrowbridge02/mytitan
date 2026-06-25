import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 1N accounting and offline queue foundations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("accounting bridge exposes live-gated Xero and QuickBooks without leaking tokens", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const readiness = await requestLocalApi(request, "/enterprise/phase-1k/accounting", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(readiness.ok()).toBeTruthy();
    const body = await readiness.json();
    expect(body.stage).toBe("phase_1n_live_gated_bridge");
    expect(body.liveProviderMutation).toBe(false);
    expect(body.dryRunValidation.oauthTokensExposed).toBe(false);
    expect(body.setupFlow).toEqual(expect.arrayContaining(["Connect accounting", "Check mappings", "Preview export", "Ready to sync", "Needs reconnecting"]));
    expect(body.featureFlags.accounting_sync_v1).toBe(false);

    const xero = body.providers.find((provider: any) => provider.provider === "xero");
    const qbo = body.providers.find((provider: any) => provider.provider === "quickbooks");
    const sage = body.providers.find((provider: any) => provider.provider === "sage");
    expect(xero.liveBridge.supported).toBe(true);
    expect(qbo.liveBridge.supported).toBe(true);
    expect(sage.liveBridge.supported).toBe(false);
    expect(xero.liveBridge.enabled).toBe(false);
    expect(qbo.liveBridge.enabled).toBe(false);
    expect(xero.liveBridge.blockedReasons).toEqual(expect.arrayContaining(["accounting_sync_v1_disabled", "accounting_live_xero_v1_disabled"]));
    expect(qbo.capabilities).toEqual(expect.arrayContaining(["live_gated_bridge", "idempotency_keys", "failed_sync_queue"]));
    expect(xero.duplicateDetection.destructiveOverwrite).toBe(false);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("refresh_token");
    expect(serialized).not.toContain("client_secret");
    expect(serialized).not.toContain("sk_live_");
    expect(serialized).not.toContain("whsec_");
  });

  test("accounting dry-run is idempotent and live sync stays blocked without explicit flags", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const payload = {
      entityType: "invoice",
      entityId: fixtureRefs.invoiceReadyJobId,
      idempotencyKey: "phase1n-xero-invoice-idempotent",
    };
    const first = await requestLocalApi(request, "/enterprise/phase-1k/accounting/xero/dry-run-export", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: payload,
    });
    expect(first.ok()).toBeTruthy();
    const firstBody = await first.json();
    expect(firstBody.liveSync).toBe(false);
    expect(firstBody.idempotencyKey).toBe(payload.idempotencyKey);

    const second = await requestLocalApi(request, "/enterprise/phase-1k/accounting/xero/dry-run-export", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: payload,
    });
    expect(second.ok()).toBeTruthy();
    const secondBody = await second.json();
    expect(secondBody.reused).toBe(true);
    expect(secondBody.id).toBe(firstBody.id);

    const live = await requestLocalApi(request, "/enterprise/phase-1k/accounting/xero/live-sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: payload,
    });
    expect(live.ok()).toBeTruthy();
    const liveBody = await live.json();
    expect(liveBody.queued).toBe(false);
    expect(liveBody.liveProviderMutation).toBe(false);
    expect(liveBody.blockedReasons).toEqual(expect.arrayContaining(["accounting_sync_v1_disabled", "accounting_live_xero_v1_disabled"]));
    expect(JSON.stringify(liveBody)).not.toContain("access_token");
  });

  test("tenant accounting state is tenant-scoped and platform diagnostics stay separated", async ({ request }) => {
    const ownerToken = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const viewerToken = await apiLogin(request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    const platformToken = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    const viewerLive = await requestLocalApi(request, "/enterprise/phase-1k/accounting/xero/live-sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
      data: { entityType: "invoice", entityId: fixtureRefs.invoiceReadyJobId },
    });
    expect([401, 403]).toContain(viewerLive.status());

    const tenantOps = await requestLocalApi(request, "/tenant/settings/operations-readiness", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(tenantOps.ok()).toBeTruthy();
    const tenantOpsJson = await tenantOps.json();
    expect(tenantOpsJson.platformDiagnosticsVisible).toBe(false);
    expect(JSON.stringify(tenantOpsJson)).not.toContain("backup confidence");

    const platform = await requestLocalApi(request, "/admin/platform/overview", {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(platform.ok()).toBeTruthy();
  });

  test("offline binary queue uses browser-safe storage and assigned-job sync metadata", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    const token = await apiLogin(request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    const packet = await requestLocalApi(request, "/enterprise/phase-1k/offline/packet", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(packet.ok()).toBeTruthy();
    const packetJson = await packet.json();
    expect(packetJson.scope).toBe("assigned_jobs_only");
    expect(packetJson.binaryQueuePolicy.architecture).toBe("service_worker_indexeddb_foundation");
    expect(packetJson.binaryQueuePolicy.authenticatedPageCaching).toBe(false);
    expect(packetJson.binaryQueuePolicy.storesSecrets).toBe(false);
    expect(packetJson.binaryQueuePolicy.storesTokens).toBe(false);
    expect(packetJson.completionGuarantee.storesBinary).toBe(false);
    expect(packetJson.completionGuarantee.storesBinaryInServerPacket).toBe(false);
    expect(JSON.stringify(packetJson)).not.toContain("refresh_token");
    const assignedJobId = String(packetJson.jobs?.[0]?.id || "");
    expect(assignedJobId).toBeTruthy();

    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });
    await expect(page.getByTestId("offline-mobile-foundation")).toContainText(/IndexedDB|Service worker/);
    const fileInput = page.locator('[data-testid^="offline-binary-input-"]').first();
    await fileInput.setInputFiles({
      name: "phase-1n-before.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sQ8V6sAAAAASUVORK5CYII=", "base64"),
    });
    await expect(page.getByTestId("offline-binary-queue-state")).toContainText(/before photo|saved_offline|queued|syncing|uploaded/i);
    await expect(page.locator("body")).not.toContainText("mytitan_token");

    const sync = await requestLocalApi(request, "/enterprise/phase-1k/offline/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        mutations: [{
          clientMutationId: "phase1n-binary-sync-metadata",
          jobId: assignedJobId,
          type: "binary_attachment",
          payload: {
            kind: "before_photo",
            filename: "phase-1n-before.png",
            mimeType: "image/png",
            sizeBytes: 68,
            source: "indexeddb_binary_queue",
            storesTokens: false,
            storesSecrets: false,
          },
        }],
      },
    });
    expect(sync.ok()).toBeTruthy();
    expect((await sync.json()).results[0].state).toMatch(/synced|conflict/);
  });

  test("design-system consolidation keeps integrations and mobile field surfaces legible", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/integrations?section=sync-control-room", { waitUntil: "networkidle" });
    await expect(page.getByTestId("connected-tools-group-accounting")).toBeVisible();
    await expect(page.getByTestId("integration-workspace-row-xero")).toContainText(/Connect Xero|Manage Xero/);
    await expect(page.getByTestId("integration-workspace-row-quickbooks")).toContainText(/Connect QuickBooks|Manage QuickBooks/);
    await expect(page.getByTestId("phase1n-accounting-setup")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("refresh_token");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });
    await expect(page.getByTestId("offline-mobile-foundation")).toBeVisible();
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(mobileOverflow).toBeLessThanOrEqual(2);
  });
});
