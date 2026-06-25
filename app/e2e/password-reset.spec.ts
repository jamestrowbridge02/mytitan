import { expect, test } from "@playwright/test";
import { fixtureRefs, installApiProxy, requestLocalApi, resolveE2EAppUrl } from "./utils";

test.describe("password reset regressions", () => {
  test.describe.configure({ mode: "serial" });

  const resetEmail = fixtureRefs.passwordResetEmail;
  let currentPassword = fixtureRefs.passwordResetPassword;

  async function requestResetLink(request: Parameters<typeof requestLocalApi>[0]) {
    const response = await requestLocalApi(request, "/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: resetEmail },
    });
    expect(response.status()).toBe(202);
    const payload = await response.json();
    expect(payload.ok).toBeTruthy();

    await expect.poll(async () => {
      const fixtureResponse = await requestLocalApi(request, `/auth/e2e/password-reset-link?email=${encodeURIComponent(resetEmail)}`);
      const fixturePayload = await fixtureResponse.json();
      return String(fixturePayload?.resetHref || "");
    }, { timeout: 5000 }).toContain("/reset-password?token=");

    const fixtureResponse = await requestLocalApi(request, `/auth/e2e/password-reset-link?email=${encodeURIComponent(resetEmail)}`);
    const fixturePayload = await fixtureResponse.json();
    return String(fixturePayload?.resetHref || "");
  }

  async function submitReset(page: any, resetHref: string, newPassword: string) {
    await page.goto(resolveE2EAppUrl(resetHref));
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
  }

  test("forgot password creates a reset email link and newest link works", async ({ page, request }) => {
    await installApiProxy(page, request);
    const resetHref = await requestResetLink(request);
    const token = new URL(resetHref).searchParams.get("token");
    expect(token).toMatch(/^reset_/);

    const nextPassword = "MyTitanReset!2026-v2";
    await submitReset(page, resetHref, nextPassword);
    await expect(page.getByText("Your password has been updated. You can sign in with the new one now.")).toBeVisible();

    const oldLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: resetEmail, password: currentPassword },
    });
    expect(oldLogin.status()).toBe(401);

    const newLogin = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: resetEmail, password: nextPassword },
    });
    expect(newLogin.ok()).toBeTruthy();
    currentPassword = nextPassword;
  });

  test("reused token fails closed", async ({ page, request }) => {
    await installApiProxy(page, request);
    const resetHref = await requestResetLink(request);
    await submitReset(page, resetHref, "MyTitanReset!2026-v3");
    await expect(page.getByText("Your password has been updated. You can sign in with the new one now.")).toBeVisible();
    currentPassword = "MyTitanReset!2026-v3";

    await submitReset(page, resetHref, "MyTitanReset!2026-v4");
    await expect(page.getByText("This link has already been used, expired, or been replaced by a newer email. Request a fresh reset link to keep going.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send a new reset email" })).toBeVisible();
  });

  test("older unused links fail after a newer request", async ({ page, request }) => {
    await installApiProxy(page, request);
    const firstHref = await requestResetLink(request);
    const secondHref = await requestResetLink(request);
    expect(secondHref).not.toBe(firstHref);

    await submitReset(page, firstHref, "MyTitanReset!2026-v4");
    await expect(page.getByText("This link has already been used, expired, or been replaced by a newer email. Request a fresh reset link to keep going.")).toBeVisible();

    await submitReset(page, secondHref, "MyTitanReset!2026-v4");
    await expect(page.getByText("Your password has been updated. You can sign in with the new one now.")).toBeVisible();
    currentPassword = "MyTitanReset!2026-v4";
  });

  test("expired and invalid links fail closed with recovery copy", async ({ page, request }) => {
    await installApiProxy(page, request);
    const resetHref = await requestResetLink(request);
    const expireResponse = await requestLocalApi(request, "/auth/e2e/password-reset-expire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: resetEmail },
    });
    expect(expireResponse.ok()).toBeTruthy();

    await submitReset(page, resetHref, "MyTitanReset!2026-v5");
    await expect(page.getByText("This link has already been used, expired, or been replaced by a newer email. Request a fresh reset link to keep going.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send a new reset email" })).toBeVisible();

    await page.goto("/reset-password?token=reset_invalid_token_but_long_enough_12345");
    await page.getByLabel("New password").fill("MyTitanReset!2026-v5");
    await page.getByLabel("Confirm password").fill("MyTitanReset!2026-v5");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("This link has already been used, expired, or been replaced by a newer email. Request a fresh reset link to keep going.")).toBeVisible();
  });

  test("reset token does not appear in the UI surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);
    const resetHref = await requestResetLink(request);
    const token = String(new URL(resetHref).searchParams.get("token") || "");

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/If an account exists/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(token);

    const login = await requestLocalApi(request, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: { email: resetEmail, password: currentPassword },
    });
    expect(login.ok()).toBeTruthy();
    const authToken = String((await login.json())?.token || "");
    const notifications = await requestLocalApi(request, "/notifications", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (notifications.ok()) {
      expect(JSON.stringify(await notifications.json())).not.toContain(token);
    } else {
      expect(notifications.status()).toBe(503);
      expect(JSON.stringify(await notifications.json())).not.toContain(token);
    }
  });
});
