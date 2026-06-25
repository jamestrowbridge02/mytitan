import { expect, test } from "@playwright/test";
import { cleanupGeneratedWorkspace, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const tenantId = "e2e-company";
const vaultPath = "/admin/platform/platform-configuration/payment-providers";

test.describe("platform backend admin recovery", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running platform-admin recovery tests.");

  test("tenant roles cannot access the platform payment-provider vault", async ({ request }) => {
    const deniedUsers = [
      [fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword],
      [fixtureRefs.financeEmail, fixtureRefs.financePassword],
      [fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword],
      [fixtureRefs.externalOperatorEmail, fixtureRefs.externalOperatorPassword],
    ];
    for (const [email, password] of deniedUsers) {
      const login = await requestLocalApi(request, "/auth/login", {
        method: "POST",
        data: { email, password },
      });
      expect(login.ok()).toBeTruthy();
      const token = String((await login.json())?.token || "");
      const response = await requestLocalApi(request, vaultPath, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([401, 403]).toContain(response.status());
    }
  });

  test("platform admin saves encrypted Connect credentials and receives redacted readiness only", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const currentResponse = await requestLocalApi(request, vaultPath, { headers });
    const current = (await currentResponse.json()).stripeConnect;
    if (current?.platformSecret?.present && current?.webhookSecret?.present) {
      expect(current.runtime).toMatchObject({
        mode: current.mode,
        platformSecretLoaded: true,
        webhookSecretLoaded: true,
        runtimeLoaded: true,
      });
      expect(JSON.stringify(current)).not.toMatch(/sk_(test|live)_|rk_(test|live)_|whsec_/);
      await page.goto("/platform/configuration", { waitUntil: "networkidle" });
      await expect(page.getByTestId("platform-payment-provider-vault")).toBeVisible();
      await expect(page.getByTestId("platform-stripe-connect-config")).toContainText(`••••${current.platformSecret.lastFour}`);
      await expect(page.getByTestId("platform-stripe-connect-config")).toContainText(`••••${current.webhookSecret.lastFour}`);
      return;
    }
    const platformSecret = `sk_test_platform_recovery_${Date.now()}_ABCD`;
    const webhookSecret = `whsec_platform_recovery_${Date.now()}_WXYZ`;

    try {
      const save = await requestLocalApi(request, `${vaultPath}/stripe-connect`, {
        method: "PATCH",
        headers,
        data: {
          platformSecret,
          webhookSecret,
          mode: "test",
          confirmation: true,
        },
      });
      expect(save.ok()).toBeTruthy();
      const saveBody = await save.json();
      expect(saveBody.stripeConnect.platformSecret).toMatchObject({ present: true, lastFour: "ABCD" });
      expect(saveBody.stripeConnect.webhookSecret).toMatchObject({ present: true, lastFour: "WXYZ" });
      expect(saveBody.stripeConnect.runtime).toMatchObject({
        mode: "test",
        platformSecretLoaded: true,
        webhookSecretLoaded: true,
        runtimeLoaded: true,
      });
      expect(JSON.stringify(saveBody)).not.toContain(platformSecret);
      expect(JSON.stringify(saveBody)).not.toContain(webhookSecret);

      const reload = await requestLocalApi(request, `${vaultPath}/stripe-connect/reload`, {
        method: "POST",
        headers,
        data: {},
      });
      expect(reload.ok()).toBeTruthy();
      expect((await reload.json()).stripeConnect.runtime).toMatchObject({
        mode: "test",
        runtimeLoaded: true,
      });

      const preflight = await requestLocalApi(request, `${vaultPath}/stripe-connect/preflight`, {
        method: "POST",
        headers,
        data: {},
      });
      expect(preflight.ok()).toBeTruthy();
      expect(await preflight.json()).toMatchObject({
        ok: false,
        mode: "test",
        state: "test_mode",
        checks: {
          platformSecretLoaded: true,
          webhookSecretLoaded: true,
          stripeClientInitialised: true,
          canReachAccountCreationStep: false,
        },
        connectedAccountCreated: false,
        accountLinkCreated: false,
      });

      const verify = await requestLocalApi(request, `${vaultPath}/stripe-connect/verify`, {
        method: "POST",
        headers,
        data: {},
      });
      expect(verify.ok()).toBeTruthy();
      const verifyBody = await verify.json();
      expect(["ready", "failed_verification"]).toContain(verifyBody.stripeConnect.readiness);
      expect(verifyBody.stripeConnect.webhookSecret.verificationStatus).toBe("verified");
      expect(JSON.stringify(verifyBody)).not.toContain(platformSecret);
      expect(JSON.stringify(verifyBody)).not.toContain(webhookSecret);

      await page.goto("/platform/configuration", { waitUntil: "networkidle" });
      await expect(page.getByTestId("platform-payment-provider-vault")).toBeVisible();
      await expect(page.getByTestId("platform-stripe-connect-config")).toContainText("••••ABCD");
      await expect(page.getByTestId("platform-stripe-connect-config")).toContainText("••••WXYZ");
      await expect(page.getByTestId("platform-stripe-connect-config")).toContainText("Runtime loaded");
      await expect(page.locator("body")).not.toContainText(platformSecret);
      await expect(page.locator("body")).not.toContainText(webhookSecret);
    } finally {
      await requestLocalApi(request, `${vaultPath}/stripe-connect`, {
        method: "DELETE",
        headers,
        data: { confirmation: true },
      });
    }
  });

  test("missing Connect credentials preserve explicit live mode and block onboarding as missing_config", async ({ request }) => {
    const platformLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const platformToken = String((await platformLogin.json())?.token || "");
    const platformHeaders = { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" };
    const currentResponse = await requestLocalApi(request, vaultPath, { headers: platformHeaders });
    const current = (await currentResponse.json()).stripeConnect;
    const tenantLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
    });
    const tenantToken = String((await tenantLogin.json())?.token || "");
    const tenantHeaders = { Authorization: `Bearer ${tenantToken}`, "Content-Type": "application/json" };

    if (current?.platformSecret?.present || current?.webhookSecret?.present) {
      const onboarding = await requestLocalApi(request, "/billing/customer-payment-readiness/stripe-connect/onboarding", {
        method: "POST",
        headers: tenantHeaders,
        data: {},
      });
      expect(onboarding.ok()).toBeTruthy();
      const onboardingBody = await onboarding.json();
      expect(onboardingBody.mode).toBe(current.mode);
      expect(JSON.stringify(onboardingBody)).not.toMatch(/sk_(test|live)_|rk_(test|live)_|whsec_/);
      return;
    }

    try {
      await requestLocalApi(request, `${vaultPath}/stripe-connect`, {
        method: "DELETE",
        headers: platformHeaders,
        data: { confirmation: true },
      });
      const modeSave = await requestLocalApi(request, `${vaultPath}/stripe-connect`, {
        method: "PATCH",
        headers: platformHeaders,
        data: { mode: "live", confirmation: true },
      });
      expect(modeSave.ok()).toBeTruthy();
      const configBody = await modeSave.json();
      expect(configBody.stripeConnect).toMatchObject({
        mode: "live",
        readiness: "missing_config",
        runtime: {
          mode: "live",
          runtimeLoaded: false,
        },
      });

      const onboarding = await requestLocalApi(request, "/billing/customer-payment-readiness/stripe-connect/onboarding", {
        method: "POST",
        headers: tenantHeaders,
        data: {},
      });
      expect(onboarding.ok()).toBeTruthy();
      expect(await onboarding.json()).toMatchObject({
        ok: false,
        mode: "live",
        state: "missing_config",
        actionUrl: null,
        summary: "Stripe setup is not available yet.",
      });

      const readiness = await requestLocalApi(request, "/billing/customer-payment-readiness", {
        headers: tenantHeaders,
      });
      expect(readiness.ok()).toBeTruthy();
      const stripe = (await readiness.json()).providers.find((provider: any) => provider.provider === "stripe-connect");
      expect(stripe).toMatchObject({
        mode: "live",
        platformConfigAvailable: false,
        onboardingAvailable: false,
        tenantAction: null,
        summary: "Stripe setup is not available yet.",
      });
    } finally {
      await requestLocalApi(request, `${vaultPath}/stripe-connect`, {
        method: "DELETE",
        headers: platformHeaders,
        data: { confirmation: true },
      });
    }
  });

  test("support-mode tenant detail does not expose platform credentials or diagnostics", async ({ request }) => {
    const login = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const token = String((await login.json())?.token || "");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/support-mode`, {
      method: "POST",
      headers,
      data: { reason: "E2E secret isolation review", durationMinutes: 5 },
    });
    const detail = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}`, { headers });
    expect(detail.ok()).toBeTruthy();
    const serialized = JSON.stringify(await detail.json());
    expect(serialized).not.toMatch(/platformSecretEncrypted|webhookSecretEncrypted|STRIPE_CONNECT_PLATFORM_SECRET|STRIPE_CONNECT_WEBHOOK_SECRET|sk_(test|live)_|whsec_/);
    await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/support-mode`, {
      method: "DELETE",
      headers,
    });
  });

  test("platform commercial controls, trial, pricing, allowance, ledger, and audit history remain authoritative", async ({ request }) => {
    const suffix = Date.now();
    const signup = await requestLocalApi(request, "/auth/signup", {
      method: "POST",
      data: {
        companyName: `Platform Recovery ${suffix}`,
        email: `platform-recovery-${suffix}@example.test`,
        password: "MyTitanPlatformRecovery!2026",
      },
    });
    expect(signup.ok()).toBeTruthy();
    const signupBody = await signup.json();
    const generatedTenantId = String(signupBody?.company?.id || "");
    const generatedOwnerToken = String(signupBody?.token || "");
    expect(generatedTenantId).toBeTruthy();
    const login = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const token = String((await login.json())?.token || "");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const reason = `E2E commercial recovery ${Date.now()}`;

    try {
    const commercial = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/commercial-controls`, {
      method: "PATCH",
      headers,
      data: {
        planCode: "BUSINESS",
        interval: "MONTHLY",
        customMonthlyPriceCents: 4321,
        customAnnualPriceCents: 43210,
        paused: false,
        billingNote: "E2E platform-only billing note",
        reason,
        confirmation: true,
      },
    });
    expect(commercial.ok()).toBeTruthy();
    const commercialBody = await commercial.json();
    expect(commercialBody.controls).toMatchObject({
      customMonthlyPriceCents: 4321,
      customAnnualPriceCents: 43210,
      paused: false,
    });
    expect(commercialBody.auditHistory.some((row: any) => row.type === "platform.tenant_commercial.update" && row.message.includes("Before=") && row.message.includes("After="))).toBe(true);

    const trialEnd = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const trial = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/trial`, {
      method: "PATCH",
      headers,
      data: {
        startedAt: new Date().toISOString(),
        endsAt: trialEnd.toISOString(),
        confirmation: true,
        reason: "E2E confirmed trial extension",
      },
    });
    expect(trial.ok()).toBeTruthy();
    expect((await trial.json()).trial.endsAt).toContain(trialEnd.toISOString().slice(0, 10));

    const pricing = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/pricing-adjustment`, {
      method: "POST",
      headers,
      data: {
        type: "fixed",
        value: 1,
        duration: "recurring",
        reason: "E2E confirmed custom pricing adjustment",
        confirmation: true,
      },
    });
    expect(pricing.ok()).toBeTruthy();
    expect((await pricing.json()).pricingState.basePriceCents).toBe(4321);

    const allowance = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/job-allowance`, {
      method: "PATCH",
      headers,
      data: {
        monthlyJobAllowance: 88,
        creditDelta: 4,
        reason: "E2E confirmed job pack allowance grant",
        confirmation: true,
      },
    });
    expect(allowance.ok()).toBeTruthy();
    const allowanceBody = await allowance.json();
    expect(allowanceBody.summary.monthlyIncludedAllowance).toBe(88);
    expect(allowanceBody.credits.some((row: any) => row.creditCount === 4 && row.creditType === "manual_add")).toBe(true);
    } finally {
      await cleanupGeneratedWorkspace(request, generatedOwnerToken);
    }
  });

  test("Tenant 360 exposes platform-only health, risk, usage, timeline, and redacted audit evidence", async ({ request }) => {
    const platformLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const platformToken = String((await platformLogin.json())?.token || "");
    const response = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/360`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      account: expect.objectContaining({ id: tenantId, riskStatus: expect.stringMatching(/Healthy|Watch|At Risk|Critical/) }),
      health: expect.objectContaining({
        score: expect.any(Number),
        reasons: expect.any(Array),
        recommendedNextAction: expect.any(String),
      }),
      usage: expect.objectContaining({
        monthlyIncludedAllowance: expect.any(Number),
        recurringExtraAllowance: expect.any(Number),
      }),
      risks: expect.any(Array),
      timeline: expect.any(Array),
      secretsReturned: false,
    }));
    expect(body.health.score).toBeGreaterThanOrEqual(0);
    expect(body.health.score).toBeLessThanOrEqual(100);
    expect(JSON.stringify(body)).not.toMatch(/platformSecretEncrypted|webhookSecretEncrypted|sk_(test|live)_|whsec_/);

    const tenantLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
    });
    const tenantToken = String((await tenantLogin.json())?.token || "");
    const denied = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/360`, {
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    expect([401, 403]).toContain(denied.status());
  });

  test("recurring allowance, manual job-pack grants, and reversal ledger entries are authoritative", async ({ request }) => {
    const suffix = Date.now();
    const signup = await requestLocalApi(request, "/auth/signup", {
      method: "POST",
      data: {
        companyName: `Allowance Authority ${suffix}`,
        email: `allowance-authority-${suffix}@example.test`,
        password: "MyTitanAllowanceAuthority!2026",
      },
    });
    expect(signup.ok()).toBeTruthy();
    const signupBody = await signup.json();
    const generatedTenantId = String(signupBody?.company?.id || "");
    const ownerToken = String(signupBody?.token || "");
    const platformLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const platformToken = String((await platformLogin.json())?.token || "");
    const headers = { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" };
    try {
      const grant = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/job-allowance`, {
        method: "PATCH",
        headers,
        data: {
          monthlyJobAllowance: 40,
          recurringExtraAllowance: 6,
          jobPackCreditCount: 9,
          reason: "E2E recurring and manual job-pack authority",
          confirmation: true,
        },
      });
      expect(grant.ok()).toBeTruthy();
      const grantBody = await grant.json();
      expect(grantBody.summary.monthlyIncludedAllowance).toBe(46);
      expect(grantBody.summary.recurringExtraAllowance).toBe(6);
      const packEntry = grantBody.credits.find((row: any) => row.creditType === "manual_job_pack" && row.creditCount === 9);
      expect(packEntry?.id).toBeTruthy();

      const reversal = await requestLocalApi(request, `/admin/platform/tenants/${generatedTenantId}/job-allowance`, {
        method: "PATCH",
        headers,
        data: {
          reverseCreditId: packEntry.id,
          reason: "E2E confirmed reversal of manual job pack",
          confirmation: true,
        },
      });
      expect(reversal.ok()).toBeTruthy();
      const reversalBody = await reversal.json();
      expect(reversalBody.credits.some((row: any) => row.creditType === "manual_reversal" && row.creditCount === -9)).toBe(true);
      expect(reversalBody.summary.manualCreditsTotal).toBe(0);
    } finally {
      await cleanupGeneratedWorkspace(request, ownerToken);
    }
  });

  test("support mode stores view-as role, defaults read-only, and audits explicit write mode", async ({ request }) => {
    const platformLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    const platformToken = String((await platformLogin.json())?.token || "");
    const headers = { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" };
    const started = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/support-mode`, {
      method: "POST",
      headers,
      data: {
        reason: "E2E finance write-mode support investigation",
        durationMinutes: 5,
        viewRole: "finance",
        accessMode: "write",
      },
    });
    expect(started.ok()).toBeTruthy();
    expect((await started.json()).session).toMatchObject({
      active: true,
      viewRole: "finance",
      accessMode: "write",
    });
    const exited = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/support-mode`, {
      method: "DELETE",
      headers,
    });
    expect(exited.ok()).toBeTruthy();
  });
});
