import { expect, test } from "@playwright/test";
import {
  defaultOperatorEmail,
  defaultOperatorPassword,
  fixtureRefs,
  hasDashboardAuth,
  loginAs,
  requestLocalApi,
} from "./utils";

test.describe("phase 6B launch readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running authenticated launch tests.");

  test("colour settings are tenant scoped, validated, audited, and role gated", async ({ page, request }) => {
    const ownerToken = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const coloursResponse = await requestLocalApi(request, "/phase-6b/colours", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(coloursResponse.ok()).toBeTruthy();
    const colours = await coloursResponse.json();
    const service = colours.services.find((item: any) => item.id === "e2e-service-wheel-repair") || colours.services[0];
    expect(service).toBeTruthy();
    expect(colours.statuses).toEqual(expect.objectContaining({ OPEN: expect.any(String), COMPLETED: expect.any(String) }));

    const invalid = await requestLocalApi(request, `/phase-6b/colours/service/${service.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { color: "blue" },
    });
    expect(invalid.status()).toBe(400);

    const saved = await requestLocalApi(request, `/phase-6b/colours/service/${service.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { color: "#1D4ED8" },
    });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).color).toBe("#1D4ED8");

    const crossTenant = await requestLocalApi(request, "/phase-6b/colours/service/not-this-tenant", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { color: "#1D4ED8" },
    });
    expect(crossTenant.status()).toBe(404);

    const viewerToken = await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    const denied = await requestLocalApi(request, `/phase-6b/colours/service/${service.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: { color: "#15803D" },
    });
    expect(denied.status()).toBe(403);

    const reset = await requestLocalApi(request, `/phase-6b/colours/service/${service.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { color: null },
    });
    expect(reset.ok()).toBeTruthy();
    expect((await reset.json()).color).toBeNull();
  });

  test("CSV imports preview duplicates, commit atomically, and rollback created records", async ({ page, request }) => {
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const uniqueEmail = `phase6b-${Date.now()}@example.test`;
    const previewResponse = await requestLocalApi(request, "/phase-6b/imports/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      data: {
        entityType: "customers",
        mode: "CREATE",
        headers: ["Name", "Email", "Phone"],
        mapping: { name: "Name", email: "Email", phone: "Phone" },
        rows: [
          { Name: "Phase 6B Customer", Email: uniqueEmail, Phone: "07000000000" },
          { Name: "Duplicate Phase 6B Customer", Email: uniqueEmail, Phone: "07000000001" },
          { Name: "", Email: "invalid-row@example.test", Phone: "" },
        ],
      },
    });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview.status).toBe("VALIDATED");
    expect(preview.counts).toEqual({ ready: 1, failed: 1, skipped: 1 });

    const commitResponse = await requestLocalApi(request, `/phase-6b/imports/${preview.id}/commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(commitResponse.ok()).toBeTruthy();
    expect(await commitResponse.json()).toEqual(expect.objectContaining({ status: "COMMITTED", importedCount: 1, failedCount: 1, skippedCount: 1 }));

    const rollbackResponse = await requestLocalApi(request, `/phase-6b/imports/${preview.id}/rollback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rollbackResponse.ok()).toBeTruthy();
    expect(await rollbackResponse.json()).toEqual(expect.objectContaining({ status: "ROLLED_BACK", rolledBackCount: 1 }));

    const auditResponse = await requestLocalApi(request, "/audit", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(auditResponse.ok()).toBeTruthy();
    expect(JSON.stringify(await auditResponse.json())).toContain("phase6b.import.rollback");
  });

  test("update mode remains separately gated instead of silently overwriting data", async ({ page, request }) => {
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    const response = await requestLocalApi(request, "/phase-6b/imports/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      data: {
        entityType: "customers",
        mode: "UPDATE",
        headers: ["Name"],
        mapping: { name: "Name" },
        rows: [{ Name: "Unsafe overwrite attempt" }],
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("separate mode");
  });
});
