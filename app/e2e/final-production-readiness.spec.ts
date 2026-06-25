import { expect, test } from "@playwright/test";
import {
  fixtureRefs,
  hasDashboardAuth,
  installApiProxy,
  loginAs,
  requestLocalApi,
} from "./utils";

test.describe("final production commercial readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running authenticated final-readiness tests.");

  test("bespoke enquiries require consent, reject HTML, and enter the platform inbox", async ({ page, request }) => {
    const unique = Date.now();
    const noConsent = await requestLocalApi(request, "/public/bespoke-account-enquiries", {
      method: "POST",
      data: {
        businessName: `Readiness Business ${unique}`,
        contactName: "Jordan Operator",
        email: `bespoke-${unique}@example.test`,
        estimatedMonthlyJobs: 900,
        locationsCount: 4,
        message: "We need a controlled account discussion for multiple branches.",
        consentToContact: false,
      },
    });
    expect(noConsent.status()).toBe(400);

    const xss = await requestLocalApi(request, "/public/bespoke-account-enquiries", {
      method: "POST",
      data: {
        businessName: "<script>alert(1)</script>",
        contactName: "Jordan Operator",
        email: `bespoke-xss-${unique}@example.test`,
        estimatedMonthlyJobs: 900,
        locationsCount: 4,
        message: "We need a controlled account discussion for multiple branches.",
        consentToContact: true,
      },
    });
    expect(xss.status()).toBe(400);

    const created = await requestLocalApi(request, "/public/bespoke-account-enquiries", {
      method: "POST",
      data: {
        businessName: `Readiness Business ${unique}`,
        contactName: "Jordan Operator",
        email: `bespoke-${unique}@example.test`,
        phone: "020 7000 0000",
        estimatedMonthlyJobs: 900,
        locationsCount: 4,
        message: "We need a controlled account discussion for multiple branches.",
        consentToContact: true,
      },
    });
    expect(created.status()).toBe(201);
    const enquiry = await created.json();
    expect(enquiry).toEqual(expect.objectContaining({ ok: true, id: expect.any(String) }));

    const platformToken = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const inbox = await requestLocalApi(request, "/admin/platform/commercial/enquiries", {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(inbox.ok()).toBeTruthy();
    expect((await inbox.json()).some((item: any) => item.id === enquiry.id && item.estimatedMonthlyJobs === 900)).toBeTruthy();
    const archived = await requestLocalApi(request, `/admin/platform/commercial/enquiries/${enquiry.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${platformToken}` },
      data: { status: "ARCHIVED", internalNote: "Automated readiness fixture archived after validation." },
    });
    expect(archived.ok()).toBeTruthy();
  });

  test("workspace review stays pending until audited platform approval", async ({ page, request }) => {
    const unique = Date.now();
    const adminToken = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const submitted = await requestLocalApi(request, "/marketing-reviews", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        rating: 5,
        quote: `The operating workflow stays clear from booking through completion ${unique}.`,
        businessName: `Approved Test Business ${unique}`,
        reviewerName: "Avery Operator",
        reviewerTitle: "Operations Director",
        consentToPublish: true,
      },
    });
    expect(submitted.status()).toBe(201);
    const review = await submitted.json();
    expect(review.status).toBe("PENDING");

    const tenantModeration = await requestLocalApi(request, `/admin/platform/commercial/reviews/${review.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: "APPROVED" },
    });
    expect(tenantModeration.status()).toBe(403);

    const before = await requestLocalApi(request, "/public/marketing-reviews");
    expect((await before.json()).some((item: any) => item.id === review.id)).toBeFalsy();

    const platformToken = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const approved = await requestLocalApi(request, `/admin/platform/commercial/reviews/${review.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${platformToken}` },
      data: {
        status: "APPROVED",
        displayQuote: review.quote,
        displayBusinessName: review.businessName,
        displayReviewerName: review.reviewerName,
        displayReviewerTitle: review.reviewerTitle,
        pinned: true,
        sortOrder: 10,
        moderationNote: "Approved after consent and display-safety review.",
      },
    });
    expect(approved.ok()).toBeTruthy();

    const published = await requestLocalApi(request, "/public/marketing-reviews");
    const publicRows = await published.json();
    expect(publicRows).toContainEqual(expect.objectContaining({
      id: review.id,
      businessName: review.businessName,
      quote: review.quote,
    }));
    expect(JSON.stringify(publicRows)).not.toContain("tenantId");
    expect(JSON.stringify(publicRows)).not.toContain("submittedByUserId");

    const audit = await requestLocalApi(request, "/audit?type=marketing_review.approved&pageSize=100", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(audit.ok()).toBeTruthy();
    expect((await audit.json()).items.some((item: any) => String(item.message).includes(review.id))).toBeTruthy();
    const archived = await requestLocalApi(request, `/admin/platform/commercial/reviews/${review.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${platformToken}` },
      data: { status: "ARCHIVED", moderationNote: "Automated readiness fixture archived after validation." },
    });
    expect(archived.ok()).toBeTruthy();
  });

  test("rejected reviews stay private and review HTML is rejected", async ({ page, request }) => {
    const unique = Date.now();
    const adminToken = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const xss = await requestLocalApi(request, "/marketing-reviews", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        rating: 5,
        quote: "<img src=x onerror=alert(1)> This should never be stored.",
        businessName: `Unsafe Test ${unique}`,
        consentToPublish: true,
      },
    });
    expect(xss.status()).toBe(400);

    const submitted = await requestLocalApi(request, "/marketing-reviews", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        rating: 3,
        quote: `This review is intentionally rejected by the moderation test ${unique}.`,
        businessName: `Rejected Test Business ${unique}`,
        consentToPublish: true,
      },
    });
    const review = await submitted.json();
    const platformToken = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const rejected = await requestLocalApi(request, `/admin/platform/commercial/reviews/${review.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${platformToken}` },
      data: { status: "REJECTED", moderationNote: "Rejected by automated moderation coverage." },
    });
    expect(rejected.ok()).toBeTruthy();
    const publicRows = await (await requestLocalApi(request, "/public/marketing-reviews")).json();
    expect(publicRows.some((item: any) => item.id === review.id)).toBeFalsy();

    const viewerToken = await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    const denied = await requestLocalApi(request, "/marketing-reviews", {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: {
        rating: 5,
        quote: "Viewer roles cannot submit reviews through this protected route.",
        businessName: "Viewer Business",
        consentToPublish: true,
      },
    });
    expect(denied.status()).toBe(403);
  });

  test("marketing uses contact and bespoke actions without phone or booking CTAs", async ({ page }) => {
    await page.route("**/public/marketing-reviews", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "approved-visible-review",
          rating: 5,
          quote: "Approved display-safe review.",
          businessName: "Approved Business",
          reviewerName: "Jordan",
          reviewerTitle: "Owner",
        }]),
      });
    });
    const response = await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Contact Us" }).first()).toHaveAttribute("href", "/contact");
    await expect(page.getByRole("link", { name: "Discuss Bespoke Account" }).first()).toHaveAttribute("href", "/bespoke-account");
    await expect(page.getByRole("link", { name: "Start Setup / Sign In" })).toHaveAttribute("href", /\/login$/);
    await expect(page.getByRole("link", { name: "Call Now" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Get Quote" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Book Online" })).toHaveCount(0);
    await expect(page.getByTestId("approved-marketing-reviews")).toContainText("Approved display-safe review.");
  });

  test("bespoke page is accessible, mobile-safe, and security headers are present", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("http://127.0.0.1:3002/bespoke-account", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /controlled commercial path/i })).toBeVisible();
    const submit = page.getByRole("button", { name: "Request account discussion" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Business name").fill("Mobile Operations");
    await page.getByLabel("Contact name").fill("Alex Owner");
    await page.getByLabel("Email").fill("alex@example.test");
    await page.getByLabel("Operating requirements").fill("We need a custom allowance across multiple operating branches.");
    await page.getByLabel(/I consent to MyTitan/).check();
    await expect(submit).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();

    const marketingHeaders = await request.get("http://127.0.0.1:3002/");
    expect(marketingHeaders.headers()["x-content-type-options"]).toBe("nosniff");
    expect(marketingHeaders.headers()["x-frame-options"]).toBe("DENY");
    const appHeaders = await request.get("http://127.0.0.1:3001/login");
    expect(appHeaders.headers()["x-content-type-options"]).toBe("nosniff");
    expect(appHeaders.headers()["x-frame-options"]).toBe("DENY");
  });

  test("tenant and platform review controls remain separated in the UI", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/reviews");
    await expect(page.getByTestId("workspace-review-submission")).toBeVisible();
    await expect(page.getByTestId("platform-review-moderation-inbox")).toHaveCount(0);

    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform/commercial");
    await expect(page.getByTestId("platform-bespoke-enquiry-inbox")).toBeVisible();
    await expect(page.getByTestId("platform-review-moderation-inbox")).toBeVisible();
  });
});
