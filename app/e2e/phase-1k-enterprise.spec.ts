import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("Phase 1K enterprise foundations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("accounting and calendar foundations expose readiness without live sync", async ({ request }) => {
    const login = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(login.ok()).toBeTruthy();
    const token = String((await login.json())?.token || "");

    const [audit, accounting, calendar] = await Promise.all([
      requestLocalApi(request, "/enterprise/phase-1k/audit", { headers: { Authorization: `Bearer ${token}` } }),
      requestLocalApi(request, "/enterprise/phase-1k/accounting", { headers: { Authorization: `Bearer ${token}` } }),
      requestLocalApi(request, "/enterprise/phase-1k/calendar", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    expect(audit.ok()).toBeTruthy();
    expect(accounting.ok()).toBeTruthy();
    expect(calendar.ok()).toBeTruthy();

    const accountingJson = await accounting.json();
    const calendarJson = await calendar.json();
    expect(accountingJson.liveSyncEnabled).toBe(false);
    expect(calendarJson.liveMutationEnabled).toBe(false);
    expect(accountingJson.providers.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["xero", "quickbooks", "sage"]));
    expect(calendarJson.providers.map((row: any) => row.provider)).toEqual(expect.arrayContaining(["google_calendar", "microsoft_calendar", "apple_ical"]));
    expect(JSON.stringify(accountingJson)).not.toContain("sk_live_");
    expect(JSON.stringify(calendarJson)).not.toContain("whsec_");
  });

  test("offline packet is assigned-job scoped and detects stale conflicts", async ({ request }) => {
    const login = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.technicianEmail, password: fixtureRefs.technicianPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(login.ok()).toBeTruthy();
    const token = String((await login.json())?.token || "");

    const packet = await requestLocalApi(request, "/enterprise/phase-1k/offline/packet", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(packet.ok()).toBeTruthy();
    const packetJson = await packet.json();
    expect(packetJson.scope).toBe("assigned_jobs_only");
    expect(packetJson.cachePolicy.storesSecrets).toBe(false);
    expect(packetJson.jobs.every((job: any) => Array.isArray(job.allowedOfflineMutations))).toBeTruthy();
    const packetJobId = packetJson.jobs[0]?.id || fixtureRefs.technicianJobId;

    const sync = await requestLocalApi(request, "/enterprise/phase-1k/offline/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        mutations: [{
          clientMutationId: "e2e-offline-conflict",
          jobId: packetJobId,
          type: "photo_metadata",
          baseVersion: "2000-01-01T00:00:00.000Z",
          payload: { label: "offline photo metadata" },
        }],
      },
    });
    expect(sync.ok()).toBeTruthy();
    const syncJson = await sync.json();
    expect(syncJson.results[0].state).toBe("conflict");
  });

  test("exports are sanitized CSV and audited behind finance permission", async ({ request }) => {
    const login = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.financeEmail, password: fixtureRefs.financePassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(login.ok()).toBeTruthy();
    const token = String((await login.json())?.token || "");

    const contacts = await requestLocalApi(request, "/enterprise/phase-1k/exports/contacts.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(contacts.ok()).toBeTruthy();
    const csv = await contacts.text();
    expect(csv.split("\n")[0]).toBe("name,email,phone,createdAt");
    expect(csv).not.toContain("password");
    expect(csv).not.toContain("token");
    expect(csv).not.toContain("sk_live_");
  });

  test("new readiness and technician simplification render in the app", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/integrations?section=sync-control-room", { waitUntil: "networkidle" });
    await expect(page.getByTestId("connected-tools-group-accounting")).toBeVisible();
    await expect(page.getByTestId("integration-workspace-row-xero")).toBeVisible();
    await expect(page.getByTestId("integration-personal-row-google")).toBeVisible();
    await expect(page.getByTestId("phase1k-integration-bridges")).toHaveCount(0);
    await expect(page.getByTestId("sync-control-room")).toHaveCount(0);

    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });
    await expect(page.getByTestId("offline-mobile-foundation")).toBeVisible();
    await expect(page.getByTestId("offline-mobile-foundation")).toContainText("No tokens, secrets, portal links");
    await expect(page.getByRole("link", { name: /Billing/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Integrations/i })).toHaveCount(0);
  });
});
