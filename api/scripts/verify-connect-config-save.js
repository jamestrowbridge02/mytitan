#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const API_BASE = String(process.env.MYTITAN_INTERNAL_API_BASE || "http://127.0.0.1:3000").replace(/\/+$/, "");
const E2E_ENABLED = process.env.MYTITAN_ENABLE_E2E_FIXTURES === "1" || process.env.MYTITAN_CONNECT_CONFIG_SAVE_SMOKE === "1";

function assertNoSecretOutput(value) {
  const serialized = JSON.stringify(value);
  if (/sk_(test|live)_|rk_(test|live)_|whsec_/i.test(serialized)) {
    throw new Error("smoke output attempted to include a Stripe secret");
  }
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const requestId = response.headers.get("x-request-id") || null;
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  return { ok: response.ok, status: response.status, requestId, body };
}

async function main() {
  const existingRows = await prisma.platformPaymentProviderConfig.count();
  const envPlatformPresent = Boolean(String(process.env.STRIPE_CONNECT_PLATFORM_SECRET || "").trim());
  const envWebhookPresent = Boolean(String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "").trim());

  if (!E2E_ENABLED && (!envPlatformPresent || !envWebhookPresent)) {
    const result = {
      ok: false,
      skippedMutation: true,
      reason: "Stripe Connect save smoke refused to write dummy credentials outside E2E/dev and no runtime Connect credentials are present.",
      existingRows,
      envPlatformPresent,
      envWebhookPresent,
    };
    assertNoSecretOutput(result);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const login = await fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: process.env.MYTITAN_CONNECT_CONFIG_SMOKE_EMAIL || "ops.staff@mytitan.co.uk",
      password: process.env.MYTITAN_CONNECT_CONFIG_SMOKE_PASSWORD || "MyTitanStaff!2026",
    }),
  });
  if (!login.ok || !login.body?.token) {
    throw new Error(`platform admin login failed for Connect config smoke: status ${login.status}`);
  }

  const suffix = `${Date.now()}`.slice(-8);
  const payload = E2E_ENABLED
    ? {
        mode: "test",
        platformSecret: `sk_test_connect_config_smoke_${suffix}`,
        webhookSecret: `whsec_connect_config_smoke_${suffix}`,
        confirmation: true,
      }
    : {
        mode: String(process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE || "live").trim().toLowerCase() === "live" ? "live" : "test",
        platformSecret: process.env.STRIPE_CONNECT_PLATFORM_SECRET,
        webhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
        confirmation: true,
      };

  const save = await fetchJson("/admin/platform/platform-configuration/payment-providers/stripe-connect", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify(payload),
  });
  const config = await fetchJson("/admin/platform/platform-configuration/payment-providers", {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  const rowsAfter = await prisma.platformPaymentProviderConfig.count();
  const stripeConnect = config.body?.stripeConnect || {};
  const result = {
    ok: Boolean(
      save.ok &&
      rowsAfter > 0 &&
      stripeConnect.platformSecret?.present &&
      stripeConnect.webhookSecret?.present &&
      stripeConnect.runtime?.runtimeLoaded,
    ),
    saveStatus: save.status,
    saveRequestId: save.requestId,
    rowsBefore: existingRows,
    rowsAfter,
    readiness: stripeConnect.readiness || "unknown",
    platformSecretPresent: Boolean(stripeConnect.platformSecret?.present),
    platformSecretSource: stripeConnect.platformSecret?.source || "missing",
    webhookSecretPresent: Boolean(stripeConnect.webhookSecret?.present),
    webhookSecretSource: stripeConnect.webhookSecret?.source || "missing",
    runtimeLoaded: Boolean(stripeConnect.runtime?.runtimeLoaded),
    billingStripeUnchangedByScript: true,
  };
  assertNoSecretOutput(result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Connect config save smoke failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
