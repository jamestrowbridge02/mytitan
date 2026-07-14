import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

function parseRgbChannels(value: string) {
  const match = value.match(/\d+(?:\.\d+)?/g) || [];
  return match.slice(0, 3).map((channel) => Number(channel));
}

function relativeLuminance([r, g, b]: number[]) {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: number[], background: number[]) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectReadableText(locator: Locator, maxChannel = 185) {
  const color = await locator.evaluate((element) => window.getComputedStyle(element).color);
  const channels = parseRgbChannels(color);
  expect(channels.length).toBeGreaterThanOrEqual(3);
  for (const channel of channels.slice(0, 3)) {
    expect(channel).toBeLessThanOrEqual(maxChannel);
  }
}

async function expectReadableAgainstSurface(locator: Locator, minimumRatio = 4.5) {
  const styles = await locator.evaluate((element) => {
    function usableBackground(node: Element | null): string {
      let current: Element | null = node;
      while (current) {
        const background = window.getComputedStyle(current).backgroundColor;
        if (background && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(background)) {
          return background;
        }
        current = current.parentElement;
      }
      return window.getComputedStyle(document.body).backgroundColor;
    }
    const computed = window.getComputedStyle(element);
    return {
      color: computed.color,
      backgroundColor: usableBackground(element),
    };
  });
  const foreground = parseRgbChannels(styles.color);
  const background = parseRgbChannels(styles.backgroundColor);
  expect(foreground.length).toBeGreaterThanOrEqual(3);
  expect(background.length).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimumRatio);
}

function dateTimeLocalInMinutes(minutesFromNow: number) {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setSeconds(0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

test.describe("dashboard workflows", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("dashboard renders the premium operational home without duplicate guidance", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    await expect(page.getByTestId("dashboard-premium-home")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("dashboard-premium-home").getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator(".mt-shell__main").getByText("Dashboard", { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("dashboard-shell-workflow-pulse")).toHaveCount(0);
    await expect(page.locator(".dashboard-premium-greeting")).toContainText(/Good morning|Good afternoon|Good evening/i);
    const headerBox = await page.locator(".dashboard-premium-header").boundingBox();
    expect(headerBox?.height || 0).toBeLessThan(120);
    await expectReadableText(page.locator(".dashboard-premium-header h1"));
    await expectReadableText(page.locator(".dashboard-premium-greeting"));
    await expect(page.locator("#dashboard-snapshot-title")).toHaveClass(/visually-hidden/);
    await expect(page.getByTestId("dashboard-primary-action")).toBeVisible();
    await expect(page.getByTestId("dashboard-snapshot-grid").locator("a")).toHaveCount(4);
    await expect(page.getByTestId("dashboard-priority-action")).toBeVisible();
    await expect(page.getByTestId("dashboard-priority-action")).toHaveCount(1);
    await expect(page.getByTestId("dashboard-today-schedule")).toBeVisible();
    await expect(page.getByTestId("dashboard-live-work")).toBeVisible();
    await expect(page.getByTestId("dashboard-recent-activity")).toBeVisible();

    const body = page.locator("body");
    await expect(body).not.toContainText(/Good (morning|afternoon|evening), hello/i);
    await expect(body).not.toContainText("E2E Portal Active");
    await expect(body).not.toContainText("E2E Portal Expired");
    await expect(body).not.toContainText("E2E-PORTAL-EXPIRED-001");
    await expect(body).not.toContainText("Rule E2E compliance exception escalation success");
    await expect(body).not.toContainText("Keep work moving from the first job sheet to payment");
    await expect(body).not.toContainText("Your core workflow is");
    await expect(body).not.toContainText("Today’s operating picture");
    await expect(body).not.toContainText("Useful areas");
    await expect(body).not.toContainText("Full work path");
    await expect(body).not.toContainText("Finish setup later");
    await expect(body).not.toContainText("Open the rest of the workspace");
    await expect(body).not.toContainText("Focus the command view on one location when you need precision");
    await expect(page.locator(".dashboard-secondary-links")).toHaveCount(0);
  });

  test("tenant pages have one page-owned title and readable shared tabs", async ({ page, request }) => {
    await installApiProxy(page, request);

    for (const route of ["/dashboard", "/dashboard/calendar", "/dashboard/bookings", "/dashboard/customers"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".mt-shell__main h1")).toHaveCount(1);
    }

    await page.goto("/dashboard/calendar", { waitUntil: "domcontentloaded" });
    for (const label of ["All", "Unassigned", "Confirmed", "In progress", "Completed"]) {
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first());
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first().locator(".operator-viewTabs__count"));
    }

    await page.goto("/dashboard/bookings", { waitUntil: "domcontentloaded" });
    for (const label of ["All", "Upcoming", "Today", "Needs conversion"]) {
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first());
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first().locator(".operator-viewTabs__count"));
    }

    await page.goto("/dashboard/customers", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mt-shell__main").getByText(/Customer intake stays clear|First-job path stays available|Move relationships into work|Workspace/)).toHaveCount(0);
    for (const label of ["All", "Ready for work", "Needs follow-up", "Missing details"]) {
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first());
      await expectReadableAgainstSurface(page.locator(".operator-viewTabs__item", { hasText: label }).first().locator(".operator-viewTabs__count"));
    }
  });

  test("dashboard activity feed is tenant-owned and excludes platform or validation events", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const unique = Date.now();
    const genuineLabel = `Tenant-owned dashboard activity ${unique}`;
    const validationLabel = `Validation-only dashboard activity ${unique}`;

    const genuineResponse = await requestLocalApi(request, "/activity/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        type: "dashboard.tenant-owned",
        label: genuineLabel,
        tenantVisible: true,
        payloadJson: {
          source: "dashboard-workflow-test",
        },
      },
    });
    expect(genuineResponse.ok()).toBeTruthy();

    const validationResponse = await requestLocalApi(request, "/activity/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        type: "dashboard.validation-only",
        label: validationLabel,
        payloadJson: {
          validation: true,
          fixture: true,
          source: "playwright",
          environment: "validation",
        },
      },
    });
    expect([201, 400]).toContain(validationResponse.status());

    const missingSubjectResponse = await requestLocalApi(request, "/activity/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        type: "dashboard.bad-subject",
        label: `Bad subject dashboard activity ${unique}`,
        jobId: `missing-cross-tenant-job-${unique}`,
      },
    });
    expect(missingSubjectResponse.status()).toBe(400);

    const recentResponse = await requestLocalApi(request, "/activity/recent?limit=30&includeValidation=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(recentResponse.ok()).toBeTruthy();
    const recent = await recentResponse.json();
    const labels = recent.map((row: any) => String(row.label || ""));
    expect(labels).toContain(genuineLabel);
    expect(labels).not.toContain(validationLabel);
    expect(labels.some((label: string) => /Rule E2E compliance exception escalation success|E2E Portal Active|E2E Portal Expired/i.test(label))).toBe(false);
  });

  test("bookings page handles blocked and successful conversion flows", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/bookings", { waitUntil: "domcontentloaded" });
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByRole("heading", { level: 1, name: /Bookings|Requests/ })).toBeVisible();

    const blockedRow = page.getByTestId(`booking-row-${fixtureRefs.blockedBookingId}`);
    await expect(blockedRow).toContainText(/blocked/i);
    await expect(blockedRow).toContainText(/customer name/i);
    await blockedRow.getByRole("button", { name: /more actions/i }).click();
    const blockedConvert = blockedRow.getByTestId(`booking-convert-${fixtureRefs.blockedBookingId}`);
    await expect(blockedConvert).toBeVisible();
    await expect(blockedConvert).toBeDisabled();
    await page.keyboard.press("Escape");

    const convertibleRow = page.getByTestId(`booking-row-${fixtureRefs.convertibleBookingId}`);
    await expect(convertibleRow).toContainText(/ready to convert today|needs conversion|in today's schedule|linked and scheduled/i);
    const convertibleSummary = (await convertibleRow.textContent()) || "";
    if (/ready to convert today|needs conversion/i.test(convertibleSummary)) {
      await convertibleRow.scrollIntoViewIfNeeded();
      await convertibleRow.getByRole("button", { name: /more actions/i }).click();
      await convertibleRow.getByTestId(`booking-convert-${fixtureRefs.convertibleBookingId}`).evaluate((element: HTMLButtonElement) => element.click());
      await expect
        .poll(async () => {
          const currentUrl = page.url();
          if (/\/dashboard\/jobs\/.+/.test(currentUrl)) return "job";
          const noticeText = await page
            .getByTestId("operator-notice-success")
            .textContent()
            .catch(() => "");
          if (/Converted booking|already linked/i.test(noticeText || "")) return "notice";
          const jobDetailHeading = await page
            .getByRole("heading", { level: 2, name: /Job details/i })
            .isVisible()
            .catch(() => false);
          const jobRunHeading = await page
            .getByRole("heading", { level: 2, name: /Run this job/i })
            .isVisible()
            .catch(() => false);
          if (jobDetailHeading || jobRunHeading) return "job";
          const rowText = await convertibleRow.textContent().catch(() => "");
          if (/existing job linked|in today's schedule|linked and scheduled/i.test(rowText || "")) return "row";
          return "pending";
        }, { timeout: 10_000, intervals: [150, 300, 600] })
        .toMatch(/job|notice|row/);
    } else {
      await expect(convertibleRow).toContainText(/existing job linked|in today's schedule|linked and scheduled/i);
    }
  });

  test("dashboard booking creation can add service bundles and preserve pricing into the linked job", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/bookings", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const unique = Date.now();
    const serviceName = `Dashboard booking service ${unique}`;
    const secondServiceName = `Dashboard bundle add-on ${unique}`;
    const customerName = `Booking Service Customer ${unique}`;

    const serviceResponse = await requestLocalApi(request, "/booking/services", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        name: serviceName,
        description: "Dashboard booking service add coverage",
        durationMinutes: "60",
        priceCents: "9900",
        discountPriceCents: "8900",
        depositType: "FIXED",
        depositValue: "1500",
        completionPaymentMode: "ON_COMPLETION",
        paymentProvider: "MANUAL",
        isActive: true,
      },
    });
    expect(serviceResponse.ok()).toBeTruthy();
    const service = await serviceResponse.json();
    const secondServiceResponse = await requestLocalApi(request, "/booking/services", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        name: secondServiceName,
        description: "Dashboard booking add-on coverage",
        durationMinutes: "30",
        priceCents: "4500",
        depositType: "NONE",
        completionPaymentMode: "ON_COMPLETION",
        paymentProvider: "MANUAL",
        isActive: true,
      },
    });
    expect(secondServiceResponse.ok()).toBeTruthy();
    const secondService = await secondServiceResponse.json();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("bookings-create-primary").click();
    await expect(page.getByTestId("booking-create-panel")).toBeVisible();
    await page.getByTestId("booking-create-service").selectOption(String(service.id));
    await page.getByTestId("booking-create-service-add").click();
    await expect(page.getByTestId("booking-create-service-add")).toBeDisabled();
    await expect(page.getByTestId("booking-create-service-summary")).toContainText(serviceName);
    await expect(page.getByTestId("booking-create-service-summary")).toContainText("£89.00");
    await page.getByTestId("booking-create-service").selectOption(String(secondService.id));
    await page.getByTestId("booking-create-service-add").click();
    await expect(page.getByTestId("booking-create-service-add")).toBeDisabled();
    await expect(page.getByTestId("booking-create-service-summary")).toContainText(secondServiceName);
    await page.getByTestId(`booking-create-service-quantity-${secondService.id}`).fill("2");
    await expect(page.getByTestId("booking-create-service-total")).toContainText("Total duration 120 minutes");
    await expect(page.getByTestId("booking-create-service-total")).toContainText("£179.00");
    await page.getByTestId(`booking-create-service-remove-${secondService.id}`).click();
    await expect(page.getByTestId("booking-create-service-summary")).not.toContainText(secondServiceName);
    await page.getByTestId("booking-create-service").selectOption(String(secondService.id));
    await page.getByTestId("booking-create-service-add").click();
    await page.getByTestId(`booking-create-service-quantity-${secondService.id}`).fill("2");
    await page.getByTestId("booking-create-customer-name").fill(customerName);
    await page.getByTestId("booking-create-customer-email").fill(`booking-service-${unique}@example.test`);
    await page.getByTestId("booking-create-start").fill(dateTimeLocalInMinutes(180));
    await expect(page.getByTestId("booking-create-end")).not.toHaveValue("");
    const createButton = page.getByTestId("booking-create-panel").getByRole("button", { name: "Create booking" });
    await createButton.dblclick();
    await expect(page.getByTestId("operator-notice-success")).toContainText(serviceName);

    const rowsResponse = await requestLocalApi(request, "/bookings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rowsResponse.ok()).toBeTruthy();
    const rows = await rowsResponse.json();
    const createdRows = rows.filter((booking: any) => booking.customerName === customerName);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]?.serviceName).toBe(serviceName);
    expect(createdRows[0]?.serviceLines).toHaveLength(2);

    const convertResponse = await requestLocalApi(request, `/bookings/${createdRows[0].id}/convert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(convertResponse.ok()).toBeTruthy();

    await expect
      .poll(async () => {
        const jobResponse = await requestLocalApi(request, `/bookings/${createdRows[0].id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!jobResponse.ok()) return "";
        const booking = await jobResponse.json();
        return String(booking?.job?.jobRef || booking?.jobId || "");
      }, { timeout: 10_000, intervals: [250, 500, 1000] })
      .not.toBe("");

    const detailResponse = await requestLocalApi(request, `/bookings/${createdRows[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const detail = await detailResponse.json();
    expect(detail?.pricingSnapshotJson?.serviceName).toBe(serviceName);
    expect(detail?.pricingSnapshotJson?.effectivePriceCents).toBe(8900);
    expect(detail?.pricingSnapshotJson?.bundleTotalCents).toBe(17900);
    expect(detail?.serviceLines).toHaveLength(2);
    expect(detail?.serviceLines?.[1]?.quantity).toBe(2);
    const jobResponse = await requestLocalApi(request, `/jobs/${detail.job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobResponse.ok()).toBeTruthy();
    const job = await jobResponse.json();
    expect(job?.formData?.bookingServiceLines).toHaveLength(2);
    expect(job?.formData?.bookingPricingSnapshot?.bundleTotalCents).toBe(17900);
    expect((job?.lineItems || []).map((line: any) => line.description)).toEqual(expect.arrayContaining([serviceName, secondServiceName]));
  });

  test("dashboard notification drawer exposes unread updates and supports mark-all-read", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const createResponse = await requestLocalApi(request, "/notifications/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "booking",
        entityId: fixtureRefs.convertibleBookingId,
        templateKey: "booking.requested",
        note: "Public booking request received",
        context: {
          customerName: "E2E Booking Customer",
        },
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-notification-bell")).toBeVisible();
    await page.getByTestId("dashboard-notification-bell").click();
    await expect(page.getByTestId("dashboard-notification-drawer")).toBeVisible();
    await expect(page.getByText(/Booking request received|booking requested/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open booking/i }).first()).toBeVisible();
    await page.getByTestId("dashboard-notifications-mark-all").click();
    await expect(page.getByText(/Everything is clear|0 unread/i).first()).toBeVisible();
  });

  test("command palette exposes contextual quick actions and recent destinations", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const createResponse = await requestLocalApi(request, "/notifications/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "job",
        entityId: fixtureRefs.invoiceReadyJobId,
        templateKey: "job.completed",
        note: "Invoice-ready job needs follow-up",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto("/dashboard/customers", { waitUntil: "domcontentloaded" });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await expect(page.getByRole("link", { name: /add contact/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /create linked job|create job/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /unpaid invoices/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /assign technician/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /open unread notifications/i }).first()).toBeVisible();
    await page.getByTestId("command-palette-search").fill(fixtureRefs.invoiceReadyJobRef);
    await expect(page.getByRole("link", { name: fixtureRefs.invoiceReadyJobRef }).first()).toBeVisible();
    await page.getByTestId("command-palette-search").fill("billing readiness");
    await expect(page.getByRole("link", { name: /billing readiness/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/dashboard/notifications", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Notifications|Internal inbox/i }).first()).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await expect(page.getByText(/Recent/i).first()).toBeVisible();
    await expect(page.getByText(/Customers|Customer flow/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("live work operating home keeps priorities and quick actions connected", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/work", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Live Work" })).toBeVisible();
    await expect(page.getByTestId("live-work-tabs")).toContainText(/Drafts/i);
    await expect(page.getByTestId("live-work-tabs")).toContainText(/In progress/i);
    await expect(page.getByTestId("live-work-tabs")).toContainText(/Ready to send/i);
    await expect(page.getByTestId("live-work-tabs")).toContainText(/Payment follow-up/i);
    await expect(page.getByTestId("live-work-queue")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Daily operating home|Recommended flow|Authoritative counts/i);
    await page.getByTestId("page-info-button").click();
    await expect(page.getByTestId("page-info-tooltip")).toContainText(/resume drafts/i);
  });

  test("bookings page stays available when legacy tenant feature flags are turned off", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const settingsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const currentSettings = await settingsResponse.json();

    try {
      const disableResponse = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
        headers: authHeaders,
        data: {
          bookingsEnabled: false,
          featureBookings: false,
        },
      });
      expect(disableResponse.ok()).toBeTruthy();

      await page.goto("/dashboard/bookings");
      await expect(page.getByRole("heading", { level: 1, name: /Bookings|Requests/ })).toBeVisible();
      await expect(page.getByPlaceholder("Search bookings...")).toBeVisible();
      await expect(page.getByText("Feature 'bookings_enabled' is disabled for this tenant")).toHaveCount(0);
      await expect(page.getByText("Bookings are off right now.")).toHaveCount(0);
    } finally {
      const restoreResponse = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
        headers: authHeaders,
        data: {
          bookingsEnabled: Boolean(currentSettings?.bookingsEnabled),
          featureBookings: Boolean(currentSettings?.featureBookings),
        },
      });
      expect(restoreResponse.ok()).toBeTruthy();
    }
  });

  test("billing readiness page exposes lifecycle controls and state changes", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.invoiceReadyJobRef)).toBeVisible();
    await expect(page.getByText(fixtureRefs.issuedJobRef)).toBeVisible();
    const invoiceReadyRow = page.locator(".operator-table__row", { hasText: fixtureRefs.invoiceReadyJobRef }).first();
    const issueInvoiceAction = page.getByTestId("billing-issue-invoice-e2e-job-invoice-ready");
    const markPaidAction = page.getByTestId("billing-mark-paid-e2e-job-invoice-ready");
    if (await issueInvoiceAction.isVisible().catch(() => false)) {
      await issueInvoiceAction.evaluate((element: HTMLButtonElement) => element.click());
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Invoice issued/i);
      await expect(invoiceReadyRow).toContainText(/Invoice issued|Issued/i);
    } else if (await markPaidAction.isVisible().catch(() => false)) {
      await markPaidAction.evaluate((element: HTMLButtonElement) => element.click());
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Payment recorded/i);
      await expect(invoiceReadyRow).toContainText(/Paid/i);
    } else {
      await expect(invoiceReadyRow).toContainText(/Paid|Invoice issued|Issued/i);
    }

    const issuedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.issuedJobRef }).first();
    await issuedRow.getByRole("button", { name: /more actions/i }).click();
    const queueAction = issuedRow.getByTestId(`billing-queue-follow-up-${"e2e-job-issued"}`);
    await expect(queueAction).toBeVisible();
    await expect(queueAction).toBeEnabled();
  });

  test("portal ops page exposes lifecycle states and recovery actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const token = await getToken(page);
    const revokeResponse = await requestLocalApi(request, `/portal/jobs/${fixtureRefs.portalExpiredJobId}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revokeResponse.ok()).toBeTruthy();

    await page.goto("/dashboard/portal");
    await expect(page.getByRole("heading", { name: "Customer Portal", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Customer access/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Appearance/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Payments/i })).toBeVisible();
    await page.getByRole("button", { name: /Portal links/i }).click();
    const portalLinksPanel = page.getByTestId("portal-links-panel");
    const activeRow = portalLinksPanel.locator(".operator-table__row", { hasText: fixtureRefs.portalActiveJobRef }).first();
    await expect(activeRow).toBeVisible();
    await expect(activeRow).toContainText(/Active/i);
    await portalLinksPanel.getByRole("button", { name: /Expired/i }).click();
    const expiredRow = portalLinksPanel.locator(".operator-table__row", { hasText: fixtureRefs.portalExpiredJobRef }).first();
    await expect(expiredRow).toBeVisible();
    const expiredPortalState = expiredRow.locator(".operator-table__cell").nth(1);
    await expect(expiredPortalState).toContainText(/Expired|Not prepared/i);
    let recoveryButton = expiredRow
      .locator(
        `[data-testid="portal-regenerate-${fixtureRefs.portalExpiredJobId}"], [data-testid="portal-prepare-${fixtureRefs.portalExpiredJobId}"]`,
      )
      .first();
    if (!(await recoveryButton.isVisible().catch(() => false))) {
      await expiredRow.getByRole("button", { name: /more actions/i }).click();
      recoveryButton = page
        .locator(
          `[data-testid="portal-regenerate-${fixtureRefs.portalExpiredJobId}"], [data-testid="portal-prepare-${fixtureRefs.portalExpiredJobId}"]`,
        )
        .filter({ visible: true })
        .first();
    }
    await expect(recoveryButton).toBeVisible();
    await recoveryButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Portal link regenerated|Portal link prepared/i);
  });

  test("technician page exposes queue actions and checklist context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    await expect(page.getByText(/today's work|assigned jobs|field note/i).first()).toBeVisible();
    await expect(page.getByTestId("technician-route-flow")).toContainText(/Open job/i);
    await expect(page.getByTestId("technician-route-flow")).toContainText(/Can wait/i);
    const technicianRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await expect(technicianRow).toBeVisible();
    await expect(technicianRow.getByText(/Workflow/i).first()).toBeVisible();
    const startButton = page.getByTestId(`technician-start-${"e2e-job-technician"}`);
    await expect(startButton).toBeVisible();
    await technicianRow.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByTestId(`technician-arrive-${"e2e-job-technician"}`)).toBeVisible();
    await page.getByTestId(`technician-note-input-${"e2e-job-technician"}`).fill("E2E note from Playwright");
    const saveNoteButton = page.getByTestId(`technician-note-save-${"e2e-job-technician"}`);
    await saveNoteButton.scrollIntoViewIfNeeded();
    await saveNoteButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Field note saved/i);
    await expect(technicianRow.getByTestId("execution-record-card")).toBeVisible();
    await expect(technicianRow.getByTestId("execution-checklist")).toBeVisible();
  });

  test("technician can save and submit a completion record", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    const token = await getToken(page);
    const technicianRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await technicianRow.getByRole("button", { name: /start record|open draft/i }).evaluate((element: HTMLButtonElement) => element.click());
    await technicianRow.getByPlaceholder("Completed work summary").fill("Playwright completion summary");
    await technicianRow.getByTestId("execution-notes-input").fill("Playwright completion notes");
    await technicianRow.getByTestId("execution-checklist").locator('input[type="checkbox"]').first().check();
    await technicianRow.getByRole("button", { name: "Save draft" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Execution record saved/i);
    await expect(technicianRow.getByTestId("execution-submit")).toContainText(/Submit completion/i);
    await technicianRow.getByTestId("execution-submit").evaluate((element: HTMLButtonElement) => element.click());
    await expect
      .poll(async () => {
        const response = await requestLocalApi(request, `/tech/queue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok()) return "unavailable";
        const queue = await response.json();
        const row = Array.isArray(queue?.jobs)
          ? queue.jobs.find((entry: any) => String(entry?.id || "") === fixtureRefs.technicianJobId)
          : null;
        return String(row?.executionRecord?.status || "");
      })
      .toBe("SUBMITTED");
  });

  test("operator can review a submitted completion record on job detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs/e2e-job-portal-active");
    await expect(page.getByTestId("job-next-step-card")).toContainText(/paid|waiting for payment|ready for customer|finish the work/i);
    await expect(page.getByTestId("job-lifecycle-card")).toContainText(/ready|sent|payment/i);
    await expect(page.getByTestId("job-customer-handoff-card")).toContainText(/ready for customer|customer can view it|ready to land|send needs retry|everything is ready/i);
    await expect(page.getByTestId("job-payment-follow-up-card")).toContainText(/paid|waiting for payment|ready to invoice|payment stays here/i);
    await expect(page.getByTestId("execution-record-card")).toContainText(/SUBMITTED|ACKNOWLEDGED/i);
    await expect(page.getByTestId("execution-evidence-list")).toContainText(fixtureRefs.seededPortalArtifactLabel);
    await expect(page.getByTestId("job-customer-handoff-card")).toContainText(/send to customer|open customer page|review last send|retry send/i);
    await expect(page.getByTestId("job-handoff-readiness-card")).toContainText(/sent|ready|waiting/i);
    await expect(page.getByRole("link", { name: /summary pdf/i }).first()).toBeVisible();
    await expect(page.getByTestId("job-workflow-handoff")).toBeVisible();
  });

  test("dashboard and start work route expose the dominant operator flow", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-premium-home")).toBeVisible();
    await expect(page.getByTestId("dashboard-primary-action")).toBeVisible();
    await expect(page.getByTestId("dashboard-priority-action")).toBeVisible();
    await expect(page.getByTestId("dashboard-today-schedule")).toBeVisible();
    await expect(page.getByTestId("dashboard-live-work")).toBeVisible();
    await page.getByRole("link", { name: "View all live work" }).click();
    await expect(page).toHaveURL(/\/dashboard\/(work|command-centre-v2)$/);
    await expect(page.getByRole("heading", { name: /Live Work|Live work/ })).toBeVisible();

    await page.goto("/dashboard/work");
    await expect(page.getByRole("heading", { name: "Live Work" })).toBeVisible();
    await expect(page.getByTestId("start-work-flow")).toBeVisible();
    await expect(page.getByTestId("start-work-primary")).toBeVisible();
    await expect(page.getByTestId("start-work-create")).toBeVisible();
    await expect(page.getByTestId("live-work-tabs")).toContainText(/Drafts/i);
    await expect(page.getByTestId("live-work-queue")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Add photos and signatures|Create invoice or submit for approval|Recommended flow/i);
    await expect(page.locator(".operator-page__statLabel", { hasText: "Needs work" })).toBeVisible();
    await expect(page.locator(".operator-page__statLabel", { hasText: "Ready to share" })).toBeVisible();
    await expect(page.locator(".operator-page__statLabel", { hasText: "Needs payment follow-up" })).toBeVisible();
  });

  test("operator queues surface clearer state and next-step labels", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto("/dashboard/jobs");
    const jobQueue = page.locator(".operator-stack").first();
    await expect(jobQueue).toContainText(/needs owner|needs scheduling|in progress|ready to share|needs payment follow-up|blocked|needs work/i);

    await page.goto("/dashboard/bookings");
    const blockedBookingRow = page.getByTestId(`booking-row-${fixtureRefs.blockedBookingId}`);
    await expect(blockedBookingRow).toContainText(/blocked/i);
    const convertibleBookingRow = page.getByTestId(`booking-row-${fixtureRefs.convertibleBookingId}`);
    await expect(convertibleBookingRow).toContainText(/ready to convert today|needs conversion|in today's schedule|linked and scheduled/i);

    await page.goto("/dashboard/customers");
    await expect(page.locator(".operator-stack").first()).toContainText(/needs details|needs follow-up|active relationship|ready for first job/i);
  });

  test("front-half pipeline surfaces keep customer and booking next steps obvious", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { name: /customers/i })).toBeVisible();
    await expect(page.getByTestId("customers-premium-header")).toBeVisible();
    await expect(page.getByTestId("customers-relationship-snapshot")).toBeVisible();
    const readyCustomerRow = page.getByTestId(`customer-row-${fixtureRefs.convertibleCustomerId}`);
    await expect(readyCustomerRow).toContainText(/ready for first job|active relationship|work linked/i);
    await readyCustomerRow.getByRole("button", { name: /more actions/i }).click();
    const customerCreateJobLink = page.getByTestId(`customer-create-job-${fixtureRefs.convertibleCustomerId}`);
    await expect(customerCreateJobLink).toBeVisible();
    await expect(customerCreateJobLink).toHaveAttribute("href", /\/dashboard\/jobs\/new\?guided=1&entry=work&customerName=/);
    await page.keyboard.press("Escape");

    await page.goto("/dashboard/bookings");
    const convertibleRow = page.getByTestId(`booking-row-${fixtureRefs.convertibleBookingId}`);
    const convertibleSummary = (await convertibleRow.textContent()) || "";
    if (/ready to convert today|needs conversion/i.test(convertibleSummary)) {
      await expect(convertibleRow.getByRole("button", { name: /convert to job/i }).first()).toBeVisible();
    } else {
      await expect(convertibleRow).toContainText(/review linked job|open linked job|linked and scheduled|in today's schedule/i);
    }
  });

  test("job creation from the work flow keeps the route focused", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs/new?guided=1&entry=work");
    await expect(page.getByRole("heading", { name: /create the next job without leaving the work flow/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start work/i }).first()).toBeVisible();
    await expect(page.getByTestId("job-entry-workflow-banner")).toContainText(/fill in what matters, finish the work, then send it on/i);
    await expect(page.getByTestId("jobs-guided-nav-top")).toContainText(/step 1 of 6/i);
    await expect(page.getByTestId("jobs-guided-nav-bottom")).toBeVisible();
  });

  test("intelligence surfaces completion acknowledgement pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("status", { name: /loading attention view/i })).toHaveCount(0, { timeout: 45000 });
    await expect(page.getByRole("heading", { name: "Intelligence", exact: true })).toBeVisible();
    const acknowledgementPressure = page.getByText(/Completion proofs awaiting acknowledgement|awaiting operator acknowledgement/i);
    const calmQueue = page.getByRole("heading", { name: /attention queues are calm right now/i });
    await expect.poll(async () => (await acknowledgementPressure.count()) + (await calmQueue.count())).toBeGreaterThan(0);
  });

  test("command centre v2 applies defaults and exposes modernized controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByRole("heading", { name: "Live work", exact: true })).toBeVisible();
    await expect(page.getByTestId("ccv2-next-action-card")).toBeVisible();
    await expect(page.getByTestId("ccv2-status-summary")).toBeVisible();
    await expect(page.getByTestId("ccv2-count-pill-scheduled")).toBeVisible();
    await expect(page.getByTestId("ccv2-count-pill-in_progress")).toBeVisible();
    await expect(page.getByTestId("ccv2-count-pill-completed")).toBeVisible();
    await expect(page.getByTestId("ccv2-recent-updates-title")).toBeVisible();
    await expect(page.getByTestId("ccv2-search-input")).toBeVisible();
    await expect(page.getByTestId("ccv2-saved-view-select")).toHaveValue("e2e-board-view-default");
    await expect(page.getByTestId("ccv2-search-input")).toHaveValue("E2E");
    await expect(page.getByTestId("ccv2-realtime-state")).toContainText(/Realtime paused|Live workspace|Updated/i);
    await expectReadableText(page.locator('[data-testid="ccv2-count-pill-scheduled"] .ccv2-count-pill__label').first());
    await expectReadableText(page.locator('[data-testid="ccv2-count-pill-completed"] .ccv2-count-pill__value').first(), 170);
    await expectReadableText(page.locator(".ccv2-activity-stream__meta").first());
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.getByTestId("ccv2-search-input").fill(fixtureRefs.commandCentreJobRef);
    await expect(page.getByTestId(`ccv2-select-${"e2e-job-open"}`)).toBeVisible();

    await page.getByTestId(`ccv2-select-${"e2e-job-open"}`).evaluate((element: HTMLInputElement) => element.click());
    await expect(page.getByTestId("ccv2-selected-count")).toContainText("1 job selected");
    await expect(page.getByTestId("ccv2-bulk-status-action")).toBeEnabled();

    await page.getByTestId("ccv2-save-view-trigger").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-save-view-panel")).toBeVisible();
    await page.getByTestId("ccv2-save-view-input").fill("Playwright temp view");
    await expect(page.getByTestId("ccv2-save-view-submit")).toBeEnabled();
    await page.getByTestId("ccv2-save-view-cancel").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-save-view-panel")).toHaveCount(0);

    await page.route(/\/jobs\/board-v2(\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    }, { times: 1 });

    const refreshButton = page.getByTestId("ccv2-refresh-button");
    await expect(refreshButton).toBeEnabled();
    await refreshButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(refreshButton).toBeDisabled();
    await expect(refreshButton).toHaveText(/Refreshing/i);
    await expect(refreshButton).toBeEnabled();

    await page.getByTestId(`ccv2-open-${"e2e-job-open"}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-sidepanel")).toBeVisible();
  });

  test("notifications centre keeps unread work grouped and actionable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const token = await getToken(page);
    const createResponse = await requestLocalApi(request, "/notifications/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "booking",
        entityId: fixtureRefs.convertibleBookingId,
        templateKey: "booking.requested",
        note: "Unread notification for centre page",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto("/dashboard/notifications", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /internal inbox/i })).toBeVisible();
    await expect(page.getByTestId("notifications-unread-section")).toBeVisible();
    await expect(page.getByText(/Unread first/i)).toBeVisible();
    const markAllButton = page.getByRole("button", { name: /Mark all read/i }).first();
    await markAllButton.click();
    await expect(page.getByTestId("notifications-empty-state")).toBeVisible();
  });

  test("workspace layout customization now lives in Settings and still persists cleanly", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByTestId("ccv2-layout-controls")).toHaveCount(0);
    await expect(page.getByTestId("ccv2-layout-settings-link")).toBeVisible();
    await page.getByRole("link", { name: /Open Workspace layout/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=general&section=workspace-layout$/);

    await page.getByTestId("settings-command-centre-default-view").selectOption("list");
    const recentUpdatesRow = page.getByTestId("settings-command-centre-layout-row-recent-updates");
    await recentUpdatesRow.getByRole("button", { name: /Hide section|Show section/ }).click();
    await page.getByRole("button", { name: /Save changes|Saved/i }).click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/saved/i);

    await page.goto("/dashboard/command-centre-v2");
    await page.reload();
    await expect(page.getByTestId("ccv2-recent-updates")).toHaveCount(0);

    await page.goto("/dashboard/settings?tab=general");
    await page.getByTestId("settings-command-centre-layout-reset").click();
    await page.getByRole("button", { name: /Save changes|Saved/i }).click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/saved/i);

    await page.goto("/dashboard/command-centre-v2");
    await page.reload();
    await expect(page.getByTestId("ccv2-recent-updates")).toBeVisible();
    await expect(page.getByTestId("ccv2-work-board")).toBeVisible();
  });

  test("command centre shows missing required field badge", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const token = await getToken(page);
    const fieldsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/custom-fields?entityType=job&visible=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fields = await fieldsResponse.json();
    const serialField = Array.isArray(fields) ? fields.find((field: any) => field?.key === fixtureRefs.customFieldJobSerialKey) : null;
    expect(serialField?.id).toBeTruthy();
    const resetResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/custom-fields/values`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "job",
        entityId: fixtureRefs.commandCentreJobId,
        values: [{ fieldId: serialField.id, valueJson: null }],
      },
    });
    expect(resetResponse.ok()).toBeTruthy();
    await page.reload();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByRole("heading", { name: "Live work", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.getByTestId("ccv2-search-input").fill(fixtureRefs.commandCentreJobRef);
    const jobCard = page.locator(".integration-card", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(jobCard.getByTestId("ccv2-required-fields-warning")).toContainText("serial_number required");

    await jobCard.getByTestId(`ccv2-open-${fixtureRefs.commandCentreJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    const sidepanel = page.getByTestId("ccv2-sidepanel");
    await expect(sidepanel).toBeVisible();
    await expect(sidepanel.getByTestId("ccv2-required-fields-warning")).toContainText("serial_number required");
    await expect(sidepanel).toContainText(/Fill these in before you move this job on: serial_number/i);
  });

  test("settings workflow terminology persists onto core operator surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");
    await expect(page.getByTestId("settings-workflow-panel")).toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const settingsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const currentSettings = await settingsResponse.json();
    const currentBusinessConfig = currentSettings?.businessConfigJson && typeof currentSettings.businessConfigJson === "object"
      ? currentSettings.businessConfigJson
      : {};
    const updateResponse = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        businessConfigJson: {
          ...currentBusinessConfig,
          terminology: {
            ...(currentBusinessConfig?.terminology || {}),
            jobs: "Work Orders",
            bookings: "Requests",
          },
          defaults: {
            ...(currentBusinessConfig?.defaults || {}),
            commandCentreVersion: "v2",
          },
          navigation: {
            ...(currentBusinessConfig?.navigation || {}),
            showIntelligence: true,
            showPortalOps: true,
            showTechnicianQueue: true,
          },
        },
      },
    });
    expect(updateResponse.ok()).toBeTruthy();
    await page.waitForTimeout(500);

    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();

    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByText(/See what needs action now, move into the job sheet quickly, and keep assignments clear/i)).toBeVisible();
  });

  test("configured workflow stages render across operator surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto("/dashboard/bookings");
    const bookingRow = page.getByTestId(`booking-row-${fixtureRefs.convertibleBookingId}`);
    await expect(bookingRow.getByTestId("workflow-stage-label")).toContainText("Confirmed Visit");

    await page.goto("/dashboard/jobs");
    const jobRow = page.getByTestId(`job-row-${fixtureRefs.commandCentreJobId}`);
    await expect(jobRow.getByTestId("workflow-stage-label")).toContainText("Ready for Dispatch");

    await page.goto("/dashboard/technician");
    const techRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await expect(techRow.getByTestId("workflow-stage-label")).toContainText(/Awaiting Arrival|Working On Site|Field Complete/);

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByText(/Ready for Dispatch/i).first()).toBeVisible();
    await expect(page.getByText(/Booked In|Work Underway|Ready to Bill/i).first()).toBeVisible();
  });

  test("intelligence page loads its attention queue", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("heading", { name: "Intelligence", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs attention now", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open queue" }).first()).toBeVisible();
  });
});
