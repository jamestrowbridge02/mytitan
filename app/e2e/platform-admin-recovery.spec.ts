import { expect, test } from "@playwright/test";
import { execFileSync } from "child_process";
import { cleanupGeneratedWorkspace, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const tenantId = "e2e-company";
const vaultPath = "/admin/platform/platform-configuration/payment-providers";

test.describe("platform backend admin recovery", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running platform-admin recovery tests.");

  test("seeded platform admin can log in through the app runtime and reach Platform Admin", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator("#login-email").fill(` ${fixtureRefs.platformAdminEmail.toUpperCase()} `);
    await page.locator("#login-password").fill(fixtureRefs.platformAdminPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/platform(?:$|[?#/])/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText("Platform Admin");
    await expect(page.locator("body")).not.toContainText("Invalid credentials");
  });

  test("platform admin can recover access through forgot-password reset without token leakage", async ({ page, request }) => {
    await installApiProxy(page, request);
    async function requestAdminResetHref() {
      const response = await requestLocalApi(request, "/auth/forgot-password", {
        method: "POST",
        data: { email: ` ${fixtureRefs.platformAdminEmail.toUpperCase()} ` },
      });
      expect(response.status()).toBe(202);
      expect(JSON.stringify(await response.json())).not.toMatch(/reset_|token|passwordHash/i);
      await expect.poll(async () => {
        const fixtureResponse = await requestLocalApi(request, `/auth/e2e/password-reset-link?email=${encodeURIComponent(fixtureRefs.platformAdminEmail)}`);
        const payload = await fixtureResponse.json();
        return String(payload?.resetHref || "");
      }, { timeout: 5000 }).toContain("/reset-password?token=");
      const fixtureResponse = await requestLocalApi(request, `/auth/e2e/password-reset-link?email=${encodeURIComponent(fixtureRefs.platformAdminEmail)}`);
      return String((await fixtureResponse.json())?.resetHref || "");
    }

    async function resetAdminPassword(resetHref: string, nextPassword: string) {
      const token = String(new URL(resetHref).searchParams.get("token") || "");
      expect(token).toMatch(/^reset_/);
      await page.goto(resetHref);
      await page.getByLabel("New password").fill(nextPassword);
      await page.getByLabel("Confirm password").fill(nextPassword);
      await page.getByRole("button", { name: "Reset password" }).click();
      await expect(page.getByText("Your password has been updated. You can sign in with the new one now.")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(token);
    }

    const temporaryPassword = `MyTitanAdminRecovered!${Date.now()}`;
    await resetAdminPassword(await requestAdminResetHref(), temporaryPassword);
    const recoveredLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: temporaryPassword },
    });
    expect(recoveredLogin.ok()).toBeTruthy();
    expect((await recoveredLogin.json())?.user?.platformAdmin).toBe(true);

    await resetAdminPassword(await requestAdminResetHref(), fixtureRefs.platformAdminPassword);
    const restoredLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformAdminEmail, password: fixtureRefs.platformAdminPassword },
    });
    expect(restoredLogin.ok()).toBeTruthy();
    expect((await restoredLogin.json())?.user?.platformAdmin).toBe(true);
  });

  test("principal admin emergency reset command is safe by default and explicit in e2e", () => {
    const safeOutput = execFileSync("docker", ["exec", "-w", "/app", "mytitan_api", "/bin/sh", "-lc", "npm run auth:issue-principal-admin-reset"], {
      encoding: "utf8",
    });
    expect(safeOutput).toContain("deliveryStatus");
    expect(safeOutput).toContain('"localResetUrlAvailable": false');
    expect(safeOutput).not.toContain("/reset-password?token=");
    expect(safeOutput).not.toMatch(/passwordHash|\\$2[aby]\\$|MYTITAN_E2EPlatform/i);

    const localOutput = execFileSync("docker", [
      "exec",
      "-w",
      "/app",
      "-e",
      "MYTITAN_ENABLE_E2E_FIXTURES=1",
      "-e",
      "MYTITAN_ALLOW_LOCAL_RESET_URL=1",
      "mytitan_api",
      "/bin/sh",
      "-lc",
      "npm run auth:issue-principal-admin-reset",
    ], {
      encoding: "utf8",
    });
    expect(localOutput).toContain("localResetUrl");
    expect(localOutput).toContain("/reset-password?token=");
    expect(localOutput).not.toMatch(/passwordHash|\\$2[aby]\\$/i);
  });

  test("verified MyTitan staff can access Platform Admin while pending staff and tenant users cannot", async ({ request }) => {
    const staffLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformStaffEmail, password: fixtureRefs.platformStaffPassword },
    });
    expect(staffLogin.ok()).toBeTruthy();
    const staffJson = await staffLogin.json();
    expect(staffJson?.user?.platformAdmin).toBe(true);
    const staffMe = await requestLocalApi(request, "/me", {
      headers: { Authorization: `Bearer ${staffJson.token}` },
    });
    expect(staffMe.ok()).toBeTruthy();
    expect((await staffMe.json())?.platformAdmin).toBe(true);

    const pendingLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.platformPendingStaffEmail, password: fixtureRefs.platformPendingStaffPassword },
    });
    expect(pendingLogin.ok()).toBeTruthy();
    const pendingJson = await pendingLogin.json();
    expect(pendingJson?.user?.platformAdmin).toBe(false);
    const pendingVault = await requestLocalApi(request, vaultPath, {
      headers: { Authorization: `Bearer ${pendingJson.token}` },
    });
    expect([401, 403]).toContain(pendingVault.status());

    const tenantLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
    });
    expect(tenantLogin.ok()).toBeTruthy();
    const tenantJson = await tenantLogin.json();
    expect(tenantJson?.user?.platformAdmin).toBe(false);
  });

  test("MyTitan staff setup tokens are redacted, single-use, expiring, and grant Platform Admin only after setup", async ({ page, request }) => {
    await installApiProxy(page, request);
    const staffEmail = `staff.setup.${Date.now()}@mytitan.co.uk`;
    const staffPassword = "MyTitanStaffSetup!2026";
    const requestSetup = await requestLocalApi(request, "/auth/platform-staff/setup-request", {
      method: "POST",
      data: { email: ` ${staffEmail.toUpperCase()} ` },
    });
    expect(requestSetup.status()).toBe(202);
    const setupBody = await requestSetup.json();
    expect(JSON.stringify(setupBody)).not.toMatch(/reset_|token|passwordHash|MyTitanStaffSetup/i);

    await expect.poll(async () => {
      const response = await requestLocalApi(request, `/auth/e2e/platform-staff-setup-link?email=${encodeURIComponent(staffEmail)}`);
      const payload = await response.json();
      return String(payload?.setupHref || "");
    }, { timeout: 5000 }).toContain("/reset-password?token=");

    const linkResponse = await requestLocalApi(request, `/auth/e2e/platform-staff-setup-link?email=${encodeURIComponent(staffEmail)}`);
    const setupHref = String((await linkResponse.json())?.setupHref || "");
    const setupToken = String(new URL(setupHref).searchParams.get("token") || "");
    expect(setupToken).toMatch(/^reset_/);

    const beforeLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: staffEmail, password: staffPassword },
    });
    expect(beforeLogin.status()).toBe(401);

    await page.goto(setupHref);
    await page.getByLabel("New password").fill(staffPassword);
    await page.getByLabel("Confirm password").fill(staffPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Your password has been updated. You can sign in with the new one now.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(setupToken);

    const staffLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      data: { email: staffEmail, password: staffPassword },
    });
    expect(staffLogin.ok()).toBeTruthy();
    const staffJson = await staffLogin.json();
    expect(staffJson?.user?.platformAdmin).toBe(true);

    const reuse = await requestLocalApi(request, "/auth/platform-staff/setup-complete", {
      method: "POST",
      data: { token: setupToken, newPassword: "MyTitanStaffSetup!2026-v2" },
    });
    expect(reuse.status()).toBe(400);

    const expiringEmail = `staff.expire.${Date.now()}@mytitan.co.uk`;
    const expiringSetup = await requestLocalApi(request, "/auth/platform-staff/setup-request", {
      method: "POST",
      data: { email: expiringEmail },
    });
    expect(expiringSetup.status()).toBe(202);
    await expect.poll(async () => {
      const response = await requestLocalApi(request, `/auth/e2e/platform-staff-setup-link?email=${encodeURIComponent(expiringEmail)}`);
      const payload = await response.json();
      return String(payload?.setupHref || "");
    }, { timeout: 5000 }).toContain("/reset-password?token=");
    const expire = await requestLocalApi(request, "/auth/e2e/platform-staff-setup-expire", {
      method: "POST",
      data: { email: expiringEmail },
    });
    expect(expire.ok()).toBeTruthy();
    const expiredLinkResponse = await requestLocalApi(request, `/auth/e2e/platform-staff-setup-link?email=${encodeURIComponent(expiringEmail)}`);
    const expiredHref = String((await expiredLinkResponse.json())?.setupHref || "");
    const expiredToken = String(new URL(expiredHref).searchParams.get("token") || "");
    const expiredComplete = await requestLocalApi(request, "/auth/platform-staff/setup-complete", {
      method: "POST",
      data: { token: expiredToken, newPassword: "MyTitanStaffExpired!2026" },
    });
    expect(expiredComplete.status()).toBe(400);

    const nonDomain = await requestLocalApi(request, "/auth/platform-staff/setup-request", {
      method: "POST",
      data: { email: `not-staff-${Date.now()}@example.com` },
    });
    expect(nonDomain.status()).toBe(202);
    expect(JSON.stringify(await nonDomain.json())).not.toMatch(/reset_|token|passwordHash/i);
  });

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
        platformSecretLoaded: expect.any(Boolean),
        webhookSecretLoaded: expect.any(Boolean),
        runtimeLoaded: expect.any(Boolean),
      });
      expect(current.platformSecret.source).toMatch(/vault|environment|runtime/i);
      expect(current.webhookSecret.source).toMatch(/vault|environment|runtime/i);
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
