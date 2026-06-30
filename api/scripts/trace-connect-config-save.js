#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const API_BASE = String(process.env.MYTITAN_INTERNAL_API_BASE || "http://127.0.0.1:3000").replace(/\/+$/, "");
const MUTATION_ALLOWED = process.env.MYTITAN_ENABLE_E2E_FIXTURES === "1" || process.env.MYTITAN_CONNECT_CONFIG_SAVE_SMOKE === "1";

function normalizeCredentialInput(value) {
  return String(value || "").replace(/[\s\u200B-\u200D\uFEFF]+/g, "").trim();
}

function classifyPayload(payload) {
  const mode = String(payload.mode || "").trim().toLowerCase() === "live" ? "live" : "test";
  const platformSecret = normalizeCredentialInput(payload.platformSecret);
  const webhookSecret = normalizeCredentialInput(payload.webhookSecret);
  return {
    mode,
    confirmationPassed: payload.confirmation === true,
    platformSecretPresent: Boolean(platformSecret),
    platformSecretPrefixPassed: mode === "live" ? /^(sk|rk)_live_/.test(platformSecret) : /^(sk|rk)_test_/.test(platformSecret),
    webhookSecretPresent: Boolean(webhookSecret),
    webhookSecretPrefixPassed: /^whsec_[A-Za-z0-9_=-]+$/.test(webhookSecret),
    normalizedInputChanged: platformSecret !== String(payload.platformSecret || "").trim() || webhookSecret !== String(payload.webhookSecret || "").trim(),
  };
}

function assertNoSecretOutput(value) {
  const serialized = JSON.stringify(value);
  if (/sk_(test|live)_|rk_(test|live)_|whsec_/i.test(serialized)) {
    throw new Error("trace output attempted to include a Stripe secret");
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
  const rowsBefore = await prisma.platformPaymentProviderConfig.count();
  const billingRowsBefore = await prisma.platformBillingStripeConfig.count();
  const envPlatformPresent = Boolean(String(process.env.STRIPE_CONNECT_PLATFORM_SECRET || "").trim());
  const envWebhookPresent = Boolean(String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "").trim());
  const payload = MUTATION_ALLOWED
    ? {
        mode: "live",
        platformSecret: `sk_live_connect_trace_${Date.now().toString(36)}`,
        webhookSecret: `whsec_connect_trace_${Date.now().toString(36)}`,
        confirmation: true,
      }
    : {
        mode: String(process.env.MYTITAN_TENANT_STRIPE_CONNECT_MODE || "live").trim().toLowerCase() === "live" ? "live" : "test",
        platformSecret: process.env.STRIPE_CONNECT_PLATFORM_SECRET || "",
        webhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "",
        confirmation: true,
      };
  const classification = classifyPayload(payload);

  const trace = {
    ok: true,
    mutationAttempted: false,
    productionSafeMode: !MUTATION_ALLOWED,
    rowsBefore,
    envPlatformPresent,
    envWebhookPresent,
    route: "/admin/platform/platform-configuration/payment-providers/stripe-connect",
    controllerEnteredAfterAuth: "requires authenticated live request; route exists in API runtime",
    firstPreUpsertRejector: !classification.confirmationPassed
      ? "PlatformPaymentProviderConfigService.save confirmation guard"
      : !classification.platformSecretPresent
        ? "PlatformPaymentProviderConfigService.save missing platformSecret"
        : !classification.platformSecretPrefixPassed
          ? "PlatformPaymentProviderConfigService.validatePlatformSecret"
          : !classification.webhookSecretPresent
            ? "PlatformPaymentProviderConfigService.save missing webhookSecret"
            : !classification.webhookSecretPrefixPassed
              ? "PlatformPaymentProviderConfigService.validateWebhookSecret"
              : null,
    validation: classification,
  };

  if (!MUTATION_ALLOWED) {
    trace.mutationSkippedReason = "Set MYTITAN_CONNECT_CONFIG_SAVE_SMOKE=1 or MYTITAN_ENABLE_E2E_FIXTURES=1 to run dummy-shaped save in dev/e2e. Production dummy writes are refused.";
    assertNoSecretOutput(trace);
    console.log(JSON.stringify(trace, null, 2));
    return;
  }

  const login = await fetchJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: process.env.MYTITAN_CONNECT_CONFIG_SMOKE_EMAIL || "ops.staff@mytitan.co.uk",
      password: process.env.MYTITAN_CONNECT_CONFIG_SMOKE_PASSWORD || "",
    }),
  });
  if (!login.ok || !login.body?.token) {
    throw new Error(`platform admin login failed for Connect trace: status ${login.status}`);
  }

  const save = await fetchJson(trace.route, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify(payload),
  });
  const config = await fetchJson("/admin/platform/platform-configuration/payment-providers", {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  const rowsAfter = await prisma.platformPaymentProviderConfig.count();
  const billingRowsAfter = await prisma.platformBillingStripeConfig.count();
  const stripeConnect = config.body?.stripeConnect || {};
  Object.assign(trace, {
    mutationAttempted: true,
    saveStatus: save.status,
    saveRequestId: save.requestId,
    rowsAfter,
    billingStripeRowsUnchanged: billingRowsBefore === billingRowsAfter,
    prismaUpsertReached: rowsAfter > rowsBefore,
    readiness: stripeConnect.readiness || "unknown",
    platformSecretPresent: Boolean(stripeConnect.platformSecret?.present),
    platformSecretSource: stripeConnect.platformSecret?.source || "missing",
    webhookSecretPresent: Boolean(stripeConnect.webhookSecret?.present),
    webhookSecretSource: stripeConnect.webhookSecret?.source || "missing",
    runtimeLoaded: Boolean(stripeConnect.runtime?.runtimeLoaded),
  });
  trace.ok = Boolean(save.ok && trace.prismaUpsertReached && trace.platformSecretPresent && trace.webhookSecretPresent && trace.runtimeLoaded && trace.billingStripeRowsUnchanged);
  assertNoSecretOutput(trace);
  console.log(JSON.stringify(trace, null, 2));
  if (!trace.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Connect config trace failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
