import { expect, test } from "@playwright/test";
import { createHmac } from "crypto";
import { fixtureRefs, hasDashboardAuth, requestLocalApi } from "./utils";
import { formatBusinessTime, parseBusinessTime, weekdayHours } from "../lib/business-hours";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 9 operational completion", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running authenticated workflow tests.");

  test("HHmm location hours convert to bounded minutes and display consistently", async () => {
    expect(parseBusinessTime("0800")).toBe(480);
    expect(parseBusinessTime("1700")).toBe(1020);
    expect(parseBusinessTime("8:00")).toBe(480);
    expect(parseBusinessTime("800")).toBe(480);
    expect(formatBusinessTime(480)).toBe("08:00");
    expect(formatBusinessTime(1020)).toBe("17:00");
    expect(weekdayHours([1, 2, 3, 4, 5]).every((hour) => (
      hour.isClosed || (Number(hour.startMinute) >= 0 && Number(hour.endMinute) <= 1440)
    ))).toBe(true);
    expect(() => parseBusinessTime("1700 minutes")).toThrow(/Use a time/);
    expect(() => parseBusinessTime("25:00")).toThrow(/valid 24-hour time/);
  });

  test("saved location hours remain within one day and can be applied to active locations", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const hours = weekdayHours([1, 2, 3, 4, 5]);
    const saved = await requestLocalApi(request, "/locations/e2e-location-hq", {
      method: "PATCH",
      headers,
      data: { name: "E2E HQ", hours },
    });
    expect(saved.ok()).toBeTruthy();

    const applied = await requestLocalApi(request, "/locations/e2e-location-hq/hours/apply-all", {
      method: "POST",
      headers,
      data: {},
    });
    expect(applied.ok()).toBeTruthy();
    expect((await applied.json()).updatedLocations).toBeGreaterThanOrEqual(1);

    const locations = await requestLocalApi(request, "/locations", { headers });
    expect(locations.ok()).toBeTruthy();
    for (const location of await locations.json()) {
      for (const hour of location.businessHours || []) {
        if (hour.isClosed) continue;
        expect(hour.startMinute).toBe(480);
        expect(hour.endMinute).toBe(1020);
        expect(hour.endMinute).toBeLessThanOrEqual(1440);
      }
    }
  });

  test("payment setup saves encrypted state without returning bank or provider secrets", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    for (const provider of ["sumup", "zettle", "worldpay", "open-banking"]) {
      const saved = await requestLocalApi(request, `/integrations/byog/${provider}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          scope: "WORKSPACE",
          status: "CONNECTED",
          credentialType: "MERCHANT_PAYMENT_GATEWAY_CONFIG",
          credentials: { accountReference: `e2e-${provider}` },
          secretMaterial: `server-only-${provider}-secret`,
          metadata: { setupSource: "phase9_test" },
        },
      });
      expect(saved.ok()).toBeTruthy();
      expect(JSON.stringify(await saved.json())).not.toContain(`server-only-${provider}-secret`);
    }

    const bank = await requestLocalApi(request, "/integrations/byog/bank-transfer", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        scope: "WORKSPACE",
        status: "CONNECTED",
        credentialType: "MERCHANT_PAYMENT_GATEWAY_CONFIG",
        credentials: { accountName: "E2E Services Ltd", sortCode: "123456", accountNumber: "12345678" },
        metadata: { paymentReference: "JOBREF" },
      },
    });
    expect(bank.ok()).toBeTruthy();
    const listed = await requestLocalApi(request, "/integrations/byog", { headers: { Authorization: `Bearer ${token}` } });
    const serialized = JSON.stringify(await listed.json());
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("server-only-");
  });

  test("asset checkout, check-in, out-of-service, and required asset warning are authoritative", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const serial = `PH9-${Date.now()}`;
    const created = await requestLocalApi(request, "/enterprise/phase-9/assets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { name: "Phase 9 torque wrench", equipmentType: "Torque wrench", serialNumber: serial, requiredForTemplate: "wheel-service" },
    });
    expect(created.ok()).toBeTruthy();
    const asset = await created.json();

    const checkout = await requestLocalApi(request, `/enterprise/phase-9/assets/${asset.id}/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { operatorId: "e2e-user-technician", jobId: fixtureRefs.invoiceReadyJobId },
    });
    expect((await checkout.json()).status).toBe("CHECKED_OUT");

    const warning = await requestLocalApi(request, "/enterprise/phase-9/assets/availability/check?template=wheel-service", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await warning.json()).warning).toBe(true);

    const checkin = await requestLocalApi(request, `/enterprise/phase-9/assets/${asset.id}/checkin`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, data: {},
    });
    expect((await checkin.json()).status).toBe("AVAILABLE");

    const out = await requestLocalApi(request, `/enterprise/phase-9/assets/${asset.id}/out-of-service`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, data: {},
    });
    expect((await out.json()).status).toBe("OUT_OF_SERVICE");
  });

  test("financial approval limits create and resolve a manager queue", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const policy = await requestLocalApi(request, "/enterprise/phase-9/approval-policies", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { kind: "REFUND", role: "ADMIN", limitCents: 1000 },
    });
    expect(policy.ok()).toBeTruthy();
    const queued = await requestLocalApi(request, "/enterprise/phase-9/approval-requests", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { kind: "REFUND", amountCents: 2500, reason: "Phase 9 threshold test" },
    });
    const requestBody = await queued.json();
    expect(requestBody.requiresManager).toBe(true);
    expect(requestBody.status).toBe("PENDING");
    const approved = await requestLocalApi(request, `/enterprise/phase-9/approval-requests/${requestBody.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { note: "Approved by manager" },
    });
    expect((await approved.json()).status).toBe("APPROVED");
  });

  test("DVLA lookup uses explicit manual fallback and never returns fake vehicle data", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-9/vehicle-lookup", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { registration: "AB12 CDE" },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.fakeData).toBe(false);
    expect(["manual_fallback", "provider_error", "found"]).toContain(body.status);
    if (body.status === "manual_fallback") expect(body.vehicle).toBeNull();
  });

  test("WhatsApp Business signed inbound replies route into the job timeline", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const webhookSecret = "phase9-whatsapp-webhook-secret";
    const saved = await requestLocalApi(request, "/integrations/byog/whatsapp-business", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        scope: "WORKSPACE",
        status: "CONNECTED",
        credentialType: "API_KEY",
        credentials: { phoneNumberId: "e2e-phone-number" },
        secretMaterial: webhookSecret,
        metadata: { phoneVerified: true, optInRequired: true },
      },
    });
    expect(saved.ok()).toBeTruthy();
    const connection = await saved.json();
    const payload = {
      id: `wa-${Date.now()}`,
      type: "message.received",
      jobId: fixtureRefs.invoiceReadyJobId,
      text: "Customer confirms the revised arrival time.",
    };
    const signature = createHmac("sha256", webhookSecret).update(JSON.stringify(payload)).digest("hex");
    const inbound = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/whatsapp-business/${connection.routeId}`, {
      headers: { "Content-Type": "application/json", "x-provider-signature": signature },
      data: payload,
    });
    expect(inbound.status()).toBe(202);

    const activity = await requestLocalApi(request, `/jobs/${fixtureRefs.invoiceReadyJobId}/activity`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(activity.ok()).toBeTruthy();
    expect(JSON.stringify(await activity.json())).toContain("Customer confirms the revised arrival time.");
  });

  test("external operators are assigned-job-only and cannot open customer, revenue, or settings APIs", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.externalOperatorEmail, fixtureRefs.externalOperatorPassword);
    const jobs = await requestLocalApi(request, "/jobs", { headers: { Authorization: `Bearer ${token}` } });
    expect(jobs.ok()).toBeTruthy();
    const rows = await jobs.json();
    expect(rows.every((job: any) => job.assignedUserId === "e2e-user-external-operator")).toBe(true);
    for (const path of ["/customers", "/revenue/tasks", "/tenant/settings"]) {
      const response = await requestLocalApi(request, path, { headers: { Authorization: `Bearer ${token}` } });
      expect([401, 403]).toContain(response.status());
    }
  });

  test("tenant payment and asset workflow routes are rendered", async ({ request }) => {
    const payments = await request.get(`${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001"}/dashboard/settings/payments`);
    expect(payments.ok()).toBeTruthy();
    const paymentsHtml = await payments.text();
    expect(paymentsHtml).toContain("Payments");
    expect(paymentsHtml.toLowerCase()).not.toContain("coming soon");

    const assets = await request.get(`${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001"}/dashboard/assets`);
    expect(assets.ok()).toBeTruthy();
    expect(await assets.text()).toContain("Asset register");
  });
});
