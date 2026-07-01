import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

function stateFromAuthUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  return parsed.searchParams.get("state") || "";
}

test.describe("Phase 1O catalog readiness and accounting OAuth onboarding", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("platform job-pack catalog shows all packs and keeps checkout gated", async ({ request }) => {
    const platformToken = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const ownerToken = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    const ownerDenied = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect([401, 403]).toContain(ownerDenied.status());

    const overview = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(overview.ok()).toBeTruthy();
    const body = await overview.json();
    expect(body.jobPackItems.map((item: any) => item.jobCount)).toEqual([10, 25, 50, 100, 250, 500]);
    expect(body.jobPackItems.map((item: any) => item.code)).toEqual([
      "job_completion_pack_1",
      "job_completion_pack_2",
      "job_completion_pack_3",
      "job_completion_pack_4",
      "job_completion_pack_5",
      "job_completion_pack_6",
    ]);
    expect(body.jobPackCheckoutReadiness.status).toBe("setup_required");
    expect(body.jobPackCheckoutReadiness.explicitCheckoutConfirm).toBe(false);
    expect(body.jobPackCheckoutReadiness.blockers).toEqual(expect.arrayContaining(["explicit_checkout_confirmation_required"]));
    expect(JSON.stringify(body)).not.toContain("sk_live_");
    expect(JSON.stringify(body)).not.toContain("sk_test_");

    const verifyAll = await requestLocalApi(request, "/admin/platform/billing-catalog/verify-job-packs", {
      method: "POST",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(verifyAll.ok()).toBeTruthy();
    const verifyBody = await verifyAll.json();
    expect(verifyBody.dryRun).toBe(true);
    expect(verifyBody.checkoutEnabled).toBe(false);
    expect(verifyBody.packs).toHaveLength(6);
    expect(JSON.stringify(verifyBody)).not.toContain("sk_live_");
    expect(JSON.stringify(verifyBody)).not.toContain("whsec_");
  });

  test("catalog mapping save is platform-only, dry-run capable, and reason-gated", async ({ request }) => {
    const platformToken = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const overrideKey = "job_pack:job_completion_pack_3:none";
    const original = await requestLocalApi(request, `/admin/platform/billing-catalog/${encodeURIComponent(overrideKey)}/reveal`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(original.ok()).toBeTruthy();
    const originalBody = await original.json();
    expect(originalBody.item?.stripeProductId).toBeTruthy();
    expect(originalBody.item?.stripePriceId).toBeTruthy();
    const payload = {
      kind: "job_pack",
      code: "job_completion_pack_3",
      interval: null,
      lookupKey: "job_completion_pack_3",
      stripeProductId: "prod_phase1o_pack3",
      stripePriceId: "price_phase1o_pack3",
      expectedAmount: "£25.00",
      currency: "GBP",
      active: false,
    };

    const dryRun = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      method: "POST",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: { ...payload, mode: "validate" },
    });
    expect(dryRun.ok()).toBeTruthy();
    const dryRunBody = await dryRun.json();
    expect(dryRunBody.dryRun).toBe(true);
    expect(dryRunBody.verification.status).toBe("inactive");
    expect(JSON.stringify(dryRunBody)).not.toContain("sk_live_");

    const missingReason = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      method: "POST",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: { ...payload, mode: "save" },
    });
    expect(missingReason.status()).toBe(400);

    const saved = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      method: "POST",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: { ...payload, mode: "save", changeNotes: "Phase 1O inactive mapping rollback fixture" },
    });
    expect(saved.ok()).toBeTruthy();
    const savedBody = await saved.json();
    expect(savedBody.item.stripePriceIdMasked).toContain("••");
    expect(JSON.stringify(savedBody)).not.toContain("price_phase1o_pack3");

    const restored = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      method: "POST",
      headers: { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" },
      data: {
        ...payload,
        stripeProductId: originalBody.item.stripeProductId,
        stripePriceId: originalBody.item.stripePriceId,
        active: true,
        mode: "save",
        changeNotes: "Restore ready pack 3 mapping after inactive fixture coverage",
      },
    });
    expect(restored.ok()).toBeTruthy();
    const restoredBody = await restored.json();
    expect(["ready", "verification_failed", "setup_needed"]).toContain(restoredBody.item.verificationStatus);
    if (restoredBody.item.verificationStatus !== "ready") {
      expect(String(restoredBody.item.verificationDetail || restoredBody.item.nextAction || "")).toMatch(
        /stripe|secret|setup|verification|provider|dry-run|validation/i,
      );
    }
    expect(JSON.stringify(restoredBody)).not.toContain("sk_live_");
  });

  test("Xero and QuickBooks OAuth onboarding is tenant-scoped and does not expose tokens", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    const wrongState = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/xero/callback?code=e2e_xero_wrong&state=wrong-state`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    } as any);
    expect(wrongState.status()).toBe(400);

    for (const provider of ["xero", "qbo"] as const) {
      const connect = await requestLocalApi(request, `/integrations/${provider}/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {},
      });
      expect(connect.ok()).toBeTruthy();
      const connectBody = await connect.json();
      expect(String(connectBody.url)).toContain("state=");
      expect(String(connectBody.url)).not.toContain("client_secret");
      expect(String(connectBody.url)).not.toContain("refresh_token");
      const state = stateFromAuthUrl(connectBody.url);
      expect(state).toHaveLength(36);

      const callbackUrl =
        provider === "qbo"
          ? `${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/qbo/callback?code=e2e_qbo_code&state=${encodeURIComponent(state)}&realmId=e2e-qbo-company`
          : `${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/xero/callback?code=e2e_xero_code&state=${encodeURIComponent(state)}`;
      const callback = await request.fetch(callbackUrl, {
        failOnStatusCode: false,
        maxRedirects: 0,
      } as any);
      expect([301, 302, 303, 307, 308]).toContain(callback.status());

      const status = await requestLocalApi(request, `/integrations/${provider}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(status.ok()).toBeTruthy();
      const statusBody = await status.json();
      expect(statusBody.connected).toBe(true);
      expect(statusBody.connectionState).toBe("ready");
      expect(statusBody.credentialStorage).toBe("server_encrypted");
      expect(statusBody.tokensReturnedToClient).toBe(false);
      const serialized = JSON.stringify(statusBody);
      expect(serialized).not.toContain("access_token");
      expect(serialized).not.toContain("refresh_token");
      expect(serialized).not.toContain("client_secret");

      const check = await requestLocalApi(request, `/integrations/${provider}/check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {},
      });
      expect(check.ok()).toBeTruthy();
      expect((await check.json()).tokensReturnedToClient).toBe(false);

      const disconnect = await requestLocalApi(request, `/integrations/${provider}/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {},
      });
      expect(disconnect.ok()).toBeTruthy();
    }
  });

  test("accounting setup UI exposes onboarding actions without token leakage", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    for (const provider of ["xero", "quickbooks"]) {
      await page.goto(`/dashboard/settings/integrations/${provider}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("provider-setup-wizard")).toBeVisible();
      await expect(page.getByTestId("provider-setup-wizard")).toContainText(/Needs setup|Connected|Not available/);
      await expect(page.locator("body")).not.toContainText("access_token");
      await expect(page.locator("body")).not.toContainText("refresh_token");
      await expect(page.locator("body")).not.toContainText("client_secret");
    }
  });
});
