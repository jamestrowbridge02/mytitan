import crypto from "crypto";
import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { getPlanBasePriceCents } from "../../api/src/billing/billing-pricing";
import { cleanupGeneratedWorkspace, defaultOperatorEmail, defaultOperatorPassword, requestLocalApi } from "./utils";

function pickPublicBookingStaffId(config: any) {
  const staff = Array.isArray(config?.staff) ? config.staff : [];
  const preferred =
    staff.find((entry: any) => /technician|staff/i.test(String(entry?.email || ""))) ||
    staff[0] ||
    null;
  return String(preferred?.id || "").trim() || null;
}

function readRootEnvValue(name: string) {
  const envPaths = [".env.local", ".env"].map((filename) => path.join(__dirname, "..", "..", filename));
  for (const envPath of envPaths) {
    try {
      const raw = fs.readFileSync(envPath, "utf8");
      const line = raw
        .split(/\r?\n/)
        .find((entry) => entry.startsWith(`${name}=`));
      if (!line) continue;
      const value = line.slice(name.length + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        return value.slice(1, -1);
      }
      return value;
    } catch {
      continue;
    }
  }
  return "";
}

function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const content = `${timestamp}.${payload}`;
  const signature = crypto.createHmac("sha256", secret).update(content).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function resolveWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || readRootEnvValue("STRIPE_WEBHOOK_SECRET");
}

function resolveStripeServerConfigured() {
  const key = process.env.STRIPE_SECRET_KEY || readRootEnvValue("STRIPE_SECRET_KEY");
  return /^(sk|rk)_(test|live)_/.test(String(key || "").trim());
}

function resolveStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || readRootEnvValue("STRIPE_SECRET_KEY");
}

function resolveStripeTestModeServerConfigured() {
  return /^(sk|rk)_test_/.test(String(resolveStripeSecretKey() || "").trim());
}

async function createStripeTestPaymentIntent(amountCents: number, currency = "gbp") {
  const secretKey = String(resolveStripeSecretKey() || "").trim();
  if (!secretKey) {
    throw new Error("Stripe secret key is required for refund tests.");
  }
  const body = new URLSearchParams();
  body.set("amount", String(Math.max(1, Math.round(amountCents))));
  body.set("currency", currency.toLowerCase());
  body.set("confirm", "true");
  body.set("payment_method", "pm_card_visa");
  body.append("payment_method_types[]", "card");
  body.append("expand[]", "latest_charge");

  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe test payment intent could not be created (${response.status}).`);
  }
  return {
    paymentIntentId: String(json?.id || ""),
    chargeId: String(json?.latest_charge?.id || json?.charges?.data?.[0]?.id || ""),
  };
}

function readCompanyIdFromToken(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(String(token || "").split(".")[1] || "", "base64url").toString("utf8"));
    return String(payload?.companyId || payload?.tenantId || "").trim();
  } catch {
    return "";
  }
}

function resolveConfiguredPlan() {
  const candidates = [
    { planCode: "BUSINESS", interval: "MONTHLY", priceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || readRootEnvValue("STRIPE_PRICE_BUSINESS_MONTHLY") },
    { planCode: "BUSINESS", interval: "ANNUAL", priceId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL || readRootEnvValue("STRIPE_PRICE_BUSINESS_ANNUAL") },
    { planCode: "SOLE_TRADER", interval: "MONTHLY", priceId: process.env.STRIPE_PRICE_SOLE_TRADER_MONTHLY || readRootEnvValue("STRIPE_PRICE_SOLE_TRADER_MONTHLY") },
    { planCode: "SOLE_TRADER", interval: "ANNUAL", priceId: process.env.STRIPE_PRICE_SOLE_TRADER_ANNUAL || readRootEnvValue("STRIPE_PRICE_SOLE_TRADER_ANNUAL") },
    { planCode: "ENTERPRISE", interval: "MONTHLY", priceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || readRootEnvValue("STRIPE_PRICE_ENTERPRISE_MONTHLY") },
    { planCode: "ENTERPRISE", interval: "ANNUAL", priceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || readRootEnvValue("STRIPE_PRICE_ENTERPRISE_ANNUAL") },
  ];
  return candidates.find((candidate) => candidate.priceId) || null;
}

async function postWebhook(request: Parameters<typeof test>[0]["request"], payloadObject: Record<string, any>, secret: string, signature?: string) {
  const payload = JSON.stringify(payloadObject);
  return request.post("http://127.0.0.1:3000/billing/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature || signStripePayload(payload, secret),
    },
    data: payload,
    failOnStatusCode: false,
  });
}

async function loginAsDefaultOperator(request: Parameters<typeof test>[0]["request"]) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: {
      email: defaultOperatorEmail,
      password: defaultOperatorPassword,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function createStripeDepositBooking(
  request: Parameters<typeof test>[0]["request"],
  ownerToken: string,
  tenantIdOverride?: string | null,
) {
  const ownerHeaders = {
    Authorization: `Bearer ${ownerToken}`,
    "Content-Type": "application/json",
  };
  const tenantSettings = await requestLocalApi(request, "/tenant/settings", {
    method: "PATCH",
    headers: ownerHeaders,
    data: {
      paymentsEnabled: true,
      featurePayments: true,
      bookingPublicEnabled: true,
      businessConfigJson: {
        paymentCollection: {
          preferredProvider: "STRIPE",
        },
      },
    },
  });
  expect(tenantSettings.ok()).toBeTruthy();
  await tenantSettings.json();
  const paymentCollectionResponse = await requestLocalApi(request, "/billing/payment-collection", {
    method: "PATCH",
    headers: ownerHeaders,
    data: {
      preferredProvider: "STRIPE",
    },
  });
  expect(paymentCollectionResponse.ok()).toBeTruthy();
  await paymentCollectionResponse.json();
  const tenantId = String(tenantIdOverride || readCompanyIdFromToken(ownerToken) || "").trim();
  expect(tenantId).toBeTruthy();

  const settingsResponse = await requestLocalApi(request, "/bookings/settings", {
    method: "POST",
    headers: ownerHeaders,
    data: {
      publicEnabled: true,
      blackoutDates: [],
      businessHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      })),
    },
  });
  expect(settingsResponse.ok()).toBeTruthy();

  const serviceResponse = await requestLocalApi(request, "/booking/services", {
    method: "POST",
    headers: ownerHeaders,
    data: {
      name: `Stripe Deposit Service ${Date.now()}`,
      description: "Stripe-backed deposit flow",
      durationMinutes: "60",
      priceCents: "14900",
      discountPriceCents: "12900",
      depositType: "FIXED",
      depositValue: "2500",
      completionPaymentMode: "ON_COMPLETION",
      paymentProvider: "STRIPE",
      customerNotes: "Stripe deposit coverage",
      isActive: true,
    },
  });
  expect(serviceResponse.ok()).toBeTruthy();
  const service = await serviceResponse.json();

  const publicSettingsResponse = await requestLocalApi(request, "/bookings/settings", {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(publicSettingsResponse.ok()).toBeTruthy();
  const publicSettings = await publicSettingsResponse.json();
  const publicToken = String(publicSettings?.publicUrl || "").split("/").pop();
  expect(publicToken).toBeTruthy();
  const publicConfigResponse = await requestLocalApi(request, `/public/booking/${publicToken}/config`);
  expect(publicConfigResponse.ok()).toBeTruthy();
  const publicConfig = await publicConfigResponse.json();
  const staffUserId = pickPublicBookingStaffId(publicConfig);

  const candidateDates = Array.from({ length: 60 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() + index + 1);
    return value.toISOString().slice(0, 10);
  }).filter((value) => {
    const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
    return day >= 1 && day <= 5;
  });

  let slot: any = null;
  for (const targetDate of candidateDates) {
    const params = new URLSearchParams({ date: targetDate, serviceId: String(service.id) });
    if (staffUserId) {
      params.set("staffUserId", staffUserId);
    }
    const slotsResponse = await requestLocalApi(request, `/public/booking/${publicToken}/slots?${params.toString()}`);
    expect(slotsResponse.ok()).toBeTruthy();
    const availability = await slotsResponse.json();
    if (Array.isArray(availability?.slots) && availability.slots[0]?.startsAt) {
      slot = availability.slots[0];
      break;
    }
  }
  expect(String(slot?.startsAt || "")).toBeTruthy();

  const createResponse = await requestLocalApi(request, `/public/booking/${publicToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      serviceId: service.id,
      startsAt: slot.startsAt,
      ...(staffUserId ? { staffUserId } : {}),
      customerName: "Stripe Deposit Customer",
      customerEmail: "stripe-deposit@example.test",
    },
  });
  return {
    tenantId,
    status: createResponse.status(),
    created: await createResponse.json(),
  };
}

test.describe("stripe webhook hardening", () => {
  const webhookSecret = resolveWebhookSecret();
  const configuredPlan = resolveConfiguredPlan();
  const stripeServerConfigured = resolveStripeServerConfigured();

  test.skip(!webhookSecret, "Stripe webhook secret is required for webhook signature tests.");

  test("checkout completion does not activate billing until Stripe payment succeeds", async ({ request }) => {
    test.skip(!configuredPlan, "Stripe price IDs are required for subscription webhook tests.");

    const uniqueId = Date.now();
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Stripe Webhook Workspace ${uniqueId}`,
        email: `stripe-webhook-${uniqueId}@example.test`,
        password: "MyTitanBilling!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    const tenantId = String(signupJson?.company?.id || "");
    const ownerHeaders = { Authorization: `Bearer ${signupJson.token}` };

    try {
      const initialBilling = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(initialBilling.ok()).toBeTruthy();
      const initialJson = await initialBilling.json();
      const initialTrialStartedAt = String(initialJson?.trial?.startedAt || "");
      expect(initialJson?.subscription?.status).toBe("trialing");

      const amountCents = getPlanBasePriceCents(configuredPlan?.planCode, configuredPlan?.interval as "MONTHLY" | "ANNUAL");
      const customerId = `cus_e2e_${uniqueId}`;
      const subscriptionId = `sub_e2e_${uniqueId}`;

      const checkoutEvent = {
        id: `evt_checkout_${uniqueId}`,
        object: "event",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: {
          object: {
            id: `cs_e2e_${uniqueId}`,
            object: "checkout.session",
            mode: "subscription",
            status: "complete",
            customer: customerId,
            subscription: subscriptionId,
            client_reference_id: tenantId,
            amount_total: amountCents,
            metadata: {
              tenantId,
              planCode: configuredPlan?.planCode,
              interval: configuredPlan?.interval,
              pricingAdjustedPriceCents: String(amountCents),
            },
          },
        },
      };

      const checkoutResponse = await postWebhook(request, checkoutEvent, webhookSecret);
      expect(checkoutResponse.ok()).toBeTruthy();

      const afterCheckout = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(afterCheckout.ok()).toBeTruthy();
      const afterCheckoutJson = await afterCheckout.json();
      expect(afterCheckoutJson?.subscription?.status).toBe("trialing");
      expect(String(afterCheckoutJson?.trial?.startedAt || "")).toBe(initialTrialStartedAt);

      const invoiceEvent = {
        id: `evt_invoice_${uniqueId}`,
        object: "event",
        type: "invoice.payment_succeeded",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: {
          object: {
            id: `in_e2e_${uniqueId}`,
            object: "invoice",
            customer: customerId,
            subscription: subscriptionId,
            amount_paid: amountCents,
            amount_due: amountCents,
            lines: {
              object: "list",
              data: [
                {
                  id: `il_e2e_${uniqueId}`,
                  object: "line_item",
                  price: {
                    id: configuredPlan?.priceId,
                    object: "price",
                  },
                },
              ],
            },
          },
        },
      };

      const invoiceResponse = await postWebhook(request, invoiceEvent, webhookSecret);
      expect(invoiceResponse.ok()).toBeTruthy();

      const activatedBilling = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(activatedBilling.ok()).toBeTruthy();
      const activatedJson = await activatedBilling.json();
      expect(activatedJson?.subscription?.status).toBe("active");
      expect(activatedJson?.plan?.code).toBe(configuredPlan?.planCode);
      expect(activatedJson?.trial?.isActive).toBe(false);
      expect(String(activatedJson?.trial?.startedAt || "")).toBe(initialTrialStartedAt);
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });

  test("duplicate Stripe webhook retries are ignored safely", async ({ request }) => {
    test.skip(!configuredPlan, "Stripe price IDs are required for subscription webhook tests.");

    const uniqueId = Date.now();
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Stripe Duplicate Workspace ${uniqueId}`,
        email: `stripe-duplicate-${uniqueId}@example.test`,
        password: "MyTitanBilling!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    const tenantId = String(signupJson?.company?.id || "");
    const ownerHeaders = { Authorization: `Bearer ${signupJson.token}` };

    try {
      await request.get("http://127.0.0.1:3000/billing/me", { headers: ownerHeaders });

      const event = {
        id: `evt_subscription_${uniqueId}`,
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: {
          object: {
            id: `sub_dupe_${uniqueId}`,
            object: "subscription",
            customer: `cus_dupe_${uniqueId}`,
            status: "active",
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            metadata: {
              tenantId,
              planCode: configuredPlan?.planCode,
              interval: configuredPlan?.interval,
            },
            items: {
              object: "list",
              data: [
                {
                  id: `si_dupe_${uniqueId}`,
                  object: "subscription_item",
                  price: {
                    id: configuredPlan?.priceId,
                    object: "price",
                  },
                },
              ],
            },
          },
        },
      };

      const first = await postWebhook(request, event, webhookSecret);
      expect(first.ok()).toBeTruthy();
      const firstJson = await first.json();
      expect(firstJson?.received).toBe(true);

      const second = await postWebhook(request, event, webhookSecret);
      expect(second.ok()).toBeTruthy();
      const secondJson = await second.json();
      expect(secondJson?.duplicate).toBe(true);

      const billing = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(billing.ok()).toBeTruthy();
      const billingJson = await billing.json();
      expect(billingJson?.subscription?.status).toBe("active");
      expect(billingJson?.plan?.code).toBe(configuredPlan?.planCode);
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });

  test("booking deposits do not fall back to MyTitan Stripe when customer money belongs to the business setup", async ({ request }) => {
    const ownerToken = await loginAsDefaultOperator(request);
    const tenantId = readCompanyIdFromToken(ownerToken);
    const result = await createStripeDepositBooking(request, ownerToken, tenantId);
    expect(result.status).toBe(400);
    expect(result.created?.code).toBe("ONLINE_PAYMENT_UNAVAILABLE");
    expect(JSON.stringify(result.created)).not.toContain("MyTitan billing");
    expect(JSON.stringify(result.created)).not.toContain("Stripe Connect");
  });

  test("unavailable tenant checkout creates no public booking status or retry path", async ({ request }) => {
    const ownerToken = await loginAsDefaultOperator(request);
    const tenantId = readCompanyIdFromToken(ownerToken);
    const result = await createStripeDepositBooking(request, ownerToken, tenantId);
    expect(result.status).toBe(400);
    expect(result.created?.booking ?? null).toBeNull();
    expect(result.created?.statusUrl ?? null).toBeNull();
    expect(result.created?.depositCheckoutUrl ?? null).toBeNull();
  });

  test("booking deposit refunds are not offered when tenant checkout is unavailable", async ({ request }) => {
    const ownerToken = await loginAsDefaultOperator(request);
    const tenantId = readCompanyIdFromToken(ownerToken);
    const result = await createStripeDepositBooking(request, ownerToken, tenantId);
    expect(result.status).toBe(400);
    expect(result.created?.booking ?? null).toBeNull();
    expect(JSON.stringify(result.created)).not.toContain("refund");
  });

  test("verified booking deposit webhook confirms once after payment succeeds", async ({ request }) => {
    const ownerToken = await loginAsDefaultOperator(request);
    const tenantId = readCompanyIdFromToken(ownerToken);
    const headers = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
    const serviceResponse = await requestLocalApi(request, "/booking/services", {
      method: "POST",
      headers,
      data: {
        name: `Webhook Deposit Service ${Date.now()}`,
        description: "Verified deposit confirmation coverage",
        durationMinutes: "60",
        priceCents: "14900",
        depositType: "FIXED",
        depositValue: "2500",
        completionPaymentMode: "ON_COMPLETION",
        paymentProvider: "STRIPE",
        isActive: true,
      },
    });
    expect(serviceResponse.ok()).toBeTruthy();
    const service = await serviceResponse.json();

    let startsAt = "";
    for (let offset = 1; offset <= 30 && !startsAt; offset += 1) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      const day = date.getUTCDay();
      if (day === 0 || day === 6) continue;
      const availability = await requestLocalApi(
        request,
        `/booking/availability?date=${date.toISOString().slice(0, 10)}&serviceId=${service.id}`,
        { headers },
      );
      expect(availability.ok()).toBeTruthy();
      startsAt = String((await availability.json())?.[0]?.startsAt || "");
    }
    expect(startsAt).toBeTruthy();

    const bookingResponse = await requestLocalApi(request, "/booking", {
      method: "POST",
      headers,
      data: {
        serviceId: service.id,
        startsAt,
        customerName: "Verified Deposit Customer",
        customerEmail: "verified.deposit@example.test",
      },
    });
    expect(bookingResponse.ok()).toBeTruthy();
    const booking = await bookingResponse.json();
    expect(String(booking.paymentStateJson?.depositStatus || "")).toBe("not_collected");

    const unique = Date.now();
    const event = {
      id: `evt_booking_deposit_${unique}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: {
        object: {
          id: `cs_booking_deposit_${unique}`,
          object: "checkout.session",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          amount_total: 2500,
          payment_intent: `pi_booking_deposit_${unique}`,
          metadata: {
            type: "booking_deposit",
            tenantId,
            bookingId: booking.id,
          },
        },
      },
    };
    const first = await postWebhook(request, event, webhookSecret);
    expect(first.ok()).toBeTruthy();
    const second = await postWebhook(request, event, webhookSecret);
    expect(second.ok()).toBeTruthy();
    expect((await second.json()).duplicate).toBe(true);

    const detailResponse = await requestLocalApi(request, `/bookings/${booking.id}`, { headers });
    expect(detailResponse.ok()).toBeTruthy();
    const detail = await detailResponse.json();
    expect(detail.status).toBe("CONFIRMED");
    expect(detail.paymentStateJson?.depositStatus).toBe("paid");
    expect(detail.paymentStateJson?.depositPaidCents).toBe(2500);
  });

  test("invalid Stripe webhook signatures are rejected", async ({ request }) => {
    const response = await postWebhook(
      request,
      {
        id: `evt_invalid_${Date.now()}`,
        object: "event",
        type: "customer.subscription.updated",
        data: { object: {} },
      },
      webhookSecret,
      "t=1,v1=invalid",
    );
    expect(response.status()).toBe(400);
  });

  test("unknown Stripe prices are rejected without activating billing", async ({ request }) => {
    const uniqueId = Date.now();
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Stripe Wrong Plan Workspace ${uniqueId}`,
        email: `stripe-wrong-plan-${uniqueId}@example.test`,
        password: "MyTitanBilling!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    const tenantId = String(signupJson?.company?.id || "");
    const ownerHeaders = { Authorization: `Bearer ${signupJson.token}` };

    try {
      const initialBilling = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(initialBilling.ok()).toBeTruthy();
      const initialJson = await initialBilling.json();
      expect(initialJson?.subscription?.status).toBe("trialing");

      const event = {
        id: `evt_wrong_plan_${uniqueId}`,
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        data: {
          object: {
            id: `sub_wrong_${uniqueId}`,
            object: "subscription",
            customer: `cus_wrong_${uniqueId}`,
            status: "active",
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            metadata: {
              tenantId,
              planCode: "BUSINESS",
              interval: "MONTHLY",
            },
            items: {
              object: "list",
              data: [
                {
                  id: `si_wrong_${uniqueId}`,
                  object: "subscription_item",
                  price: {
                    id: "price_unknown_invalid",
                    object: "price",
                  },
                },
              ],
            },
          },
        },
      };

      const webhookResponse = await postWebhook(request, event, webhookSecret);
      expect(webhookResponse.status()).toBe(400);

      const afterBilling = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(afterBilling.ok()).toBeTruthy();
      const afterJson = await afterBilling.json();
      expect(afterJson?.subscription?.status).toBe("trialing");
      expect(afterJson?.trial?.isActive).toBe(true);
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });
});
