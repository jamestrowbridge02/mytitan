import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sQ8V6sAAAAASUVORK5CYII=";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 1M enterprise trust architecture", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("workflow-first navigation routes without exposing platform diagnostics to tenants", async ({ page, request }) => {
    await installApiProxy(page, request);
    const ownerToken = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /Get Paid|Payments/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Customers|Get Customers/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Work|Complete Work/i }).first()).toBeVisible();

    const tenantOps = await requestLocalApi(request, "/tenant/settings/operations-readiness", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(tenantOps.ok()).toBeTruthy();
    const tenantOpsJson = await tenantOps.json();
    expect(tenantOpsJson.scope).toBe("tenant_business");
    expect(tenantOpsJson.platformDiagnosticsVisible).toBe(false);
    expect(tenantOpsJson.backupReadiness).toBeUndefined();
    expect(tenantOpsJson.externalMonitoring).toBeUndefined();
    expect(JSON.stringify(tenantOpsJson)).not.toContain("BACKUP_ENCRYPTION_KEY");
    expect(JSON.stringify(tenantOpsJson)).not.toContain("STRIPE_SECRET_KEY");

    await page.goto("/dashboard/settings/operations", { waitUntil: "networkidle" });
    await expect(page.getByTestId("operations-readiness-table")).toBeVisible();
    await expect(page.getByTestId("backup-readiness-card")).toHaveCount(0);
    await expect(page.getByTestId("external-monitor-provider-card")).toHaveCount(0);
    await expect(page.getByTestId("internal-monitoring-overview")).toHaveCount(0);
  });

  test("platform admin keeps platform diagnostics on the separate platform surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-uptime-availability-card")).toBeVisible();
    await expect(page.getByTestId("platform-uptime-availability-card")).toContainText(/Internal platform health|Healthy|Degraded|Attention needed|Down/i);
    await expect(page.locator("body")).not.toContainText("sk_live_");
    await expect(page.locator("body")).not.toContainText("whsec_");
  });

  test("job sheet third-party delivery prepares binary attachments safely and keeps selections tenant scoped", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const create = await requestLocalApi(request, "/jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        customerName: "Phase 1M Evidence Customer",
        customerEmail: "phase1m-evidence@example.test",
        serviceName: "Phase 1M retained evidence job",
        beforeMedia: [{ data: PIXEL_DATA_URL, filename: "before-phase-1m.png", mimeType: "image/png" }],
        afterMedia: [{ data: PIXEL_DATA_URL, filename: "after-phase-1m.png", mimeType: "image/png" }],
        formData: {
          work_summary: "Phase 1M retained work summary",
          completionNotes: "Phase 1M retained completion note",
        },
      },
    });
    expect(create.ok()).toBeTruthy();
    const created = await create.json();
    const jobId = String(created?.id || created?.job?.id || "");
    expect(jobId).toBeTruthy();

    const detail = await requestLocalApi(request, `/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    const assets = Array.isArray(detailJson.assets) ? detailJson.assets : [];
    expect(assets.some((asset: any) => asset.kind === "BEFORE")).toBeTruthy();
    expect(assets.some((asset: any) => asset.kind === "AFTER")).toBeTruthy();

    const share = await requestLocalApi(request, `/jobs/${jobId}/share-job-sheet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        recipientEmail: "phase1m-share@mytitan.example",
        includePdf: true,
        jobAssetIds: assets.slice(0, 2).map((asset: any) => asset.id),
        documentArtifactIds: [],
        message: "Phase 1M binary attachment capture test",
      },
    });
    expect(share.ok()).toBeTruthy();
    const shareJson = await share.json();
    expect(["captured", "suppressed", "not_configured", "deferred"]).toContain(shareJson.delivery.status);
    expect(shareJson.binaryAttachmentsPrepared).toBeGreaterThanOrEqual(2);
    expect(["binary_attachments_captured", "binary_attachments", "binary_attachments_not_configured"]).toContain(shareJson.attachmentMode);
    expect(JSON.stringify(shareJson)).not.toContain("smtp://");
    expect(JSON.stringify(shareJson)).not.toContain("sk_live_");

    const badSelection = await requestLocalApi(request, `/jobs/${jobId}/share-job-sheet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { recipientEmail: "phase1m-share@mytitan.example", jobAssetIds: ["not-this-tenant-asset"] },
    });
    expect(badSelection.status()).toBe(400);
  });

  test("offline completion and accounting readiness remain scoped dry-run contracts", async ({ request }) => {
    const techToken = await apiLogin(request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    const ownerToken = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    const packet = await requestLocalApi(request, "/enterprise/phase-1k/offline/packet", {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    expect(packet.ok()).toBeTruthy();
    const packetJson = await packet.json();
    expect(packetJson.scope).toBe("assigned_jobs_only");
    expect(packetJson.cachePolicy.fullAuthenticatedAppCaching).toBe(false);
    expect(packetJson.completionGuarantee.noLostCompletedWork).toBe(true);
    expect(packetJson.completionGuarantee.storesBinary).toBe(false);
    expect(packetJson.jobs.every((job: any) => job.allowedOfflineMutations.includes("completion_notes"))).toBeTruthy();
    expect(JSON.stringify(packetJson)).not.toContain("token");
    const jobId = String(packetJson.jobs?.[0]?.id || fixtureRefs.technicianJobId);

    const sync = await requestLocalApi(request, "/enterprise/phase-1k/offline/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${techToken}`, "Content-Type": "application/json" },
      data: {
        mutations: [{
          clientMutationId: "phase1m-offline-completion-note",
          jobId,
          type: "completion_notes",
          baseVersion: packetJson.jobs?.[0]?.version || null,
          payload: { note: "Offline completion metadata only" },
        }],
      },
    });
    expect(sync.ok()).toBeTruthy();
    expect((await sync.json()).results[0].state).toMatch(/synced|conflict/);

    const accounting = await requestLocalApi(request, "/enterprise/phase-1k/accounting", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(accounting.ok()).toBeTruthy();
    const accountingJson = await accounting.json();
    expect(accountingJson.liveSyncEnabled).toBe(false);
    expect(accountingJson.dryRunValidation.oauthTokensExposed).toBe(false);
    const xero = accountingJson.providers.find((provider: any) => provider.provider === "xero");
    expect(xero.capabilities).toEqual(expect.arrayContaining(["ledger_mapping_preview", "tax_vat_mapping_readiness", "sync_conflict_preview"]));
    expect(xero.mappingPreview.invoice.queue).toContain("dry_run_export");

    const dryRun = await requestLocalApi(request, "/enterprise/phase-1k/accounting/xero/dry-run-export", {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      data: { entityType: "invoice", entityId: jobId },
    });
    expect(dryRun.ok()).toBeTruthy();
    expect((await dryRun.json()).liveSync).toBe(false);
  });
});
