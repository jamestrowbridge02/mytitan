import { expect, test } from "@playwright/test";

const publicAppLoginUrl = `${String(process.env.APP_PUBLIC_URL || "https://app.mytitan.co.uk").replace(/\/+$/, "")}/login`;

test.describe("marketing pricing transparency", () => {
  test("pricing page shows explicit monthly completed-job allowances and real signup CTA", async ({ page }) => {
    const response = await page.goto("http://127.0.0.1:3002/pricing", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /pricing with clear allowances and clean billing boundaries/i })).toBeVisible();
    await expect(page.getByText("Up to 20 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 60 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 200 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 500 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Business").first()).toBeVisible();
    await expect(page.getByText("Enterprise").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Annual" })).toBeVisible();
    await expect(page.getByText(/£5, £12\.50, £25, and £50/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Annual" }).click();
    await expect(page.getByText("£190 per year, billed annually").first()).toBeVisible();

    const createWorkspace = page.getByRole("link", { name: /start 14-day trial/i }).first();
    await expect(createWorkspace).toHaveAttribute("href", /\/signup$/);
  });

  test("homepage pricing comparison points users to real pricing and signup routes", async ({ page }) => {
    const response = await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /run field service from one clear system/i })).toBeVisible();
    await expect(page.getByText(/monthly completed-job allowances are clear from the start/i)).toBeVisible();
    await expect(page.getByText("Up to 20 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 60 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 200 job completions/month").first()).toBeVisible();
    await expect(page.getByText("Up to 500 job completions/month").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /start 14-day trial/i }).first()).toHaveAttribute("href", /\/signup$/);
    await expect(page.getByRole("link", { name: "Contact Us" }).first()).toHaveAttribute("href", "/contact");
    await expect(page.getByRole("link", { name: "Compare plans" })).toHaveAttribute("href", "/pricing");
    await expect(page.getByTestId("marketing-home-plan-sole-trader")).toHaveAttribute("href", "/pricing");
  });

  test("marketing navigation and card routes stay live across key pages", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.locator("#mkt-navigation-drawer").getByRole("link", { name: /Platform/ }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: /see how work stays connected from booking to billing/i })).toBeVisible();

    await page.getByRole("link", { name: /review controls/i }).first().click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { name: /built with clear boundaries and controls/i })).toBeVisible();

    await page.goto("http://127.0.0.1:3002/solutions", { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /see plan fit/i }).first()).toHaveAttribute("href", "/pricing");
  });

  test("mobile marketing menu stays compact and routes correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.locator("#mkt-navigation-drawer")).toBeVisible();
    const pricingLink = page.locator("#mkt-navigation-drawer").getByRole("link", { name: /Pricing/ });
    await expect(pricingLink).toBeVisible();
    await pricingLink.click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("marketing command header keeps real CTAs visible and drawer supports escape and focus return", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
    const menu = page.getByRole("button", { name: "Open navigation menu" });
    await expect(page.getByRole("link", { name: "Contact Us" }).first()).toHaveAttribute("href", "/contact");
    await expect(page.getByRole("link", { name: "Discuss Bespoke Account" }).first()).toHaveAttribute("href", "/bespoke-account");
    await expect(page.getByRole("link", { name: "Start Setup / Sign In" })).toHaveAttribute("href", /\/login$/);
    await expect(page.getByRole("link", { name: "Call Now" })).toHaveCount(0);
    await menu.click();
    await expect(page.locator("#mkt-navigation-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#mkt-navigation-drawer")).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  test("homepage metadata and integration claims stay accurate", async ({ page, request }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.mytitan.co.uk/");
    await expect(page.locator('meta[property="og:title"]').first()).toHaveAttribute("content", /Field Service Operating System/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator("#integrations")).toContainText(/readiness-gated|tenant-owned/i);
    await expect(page.locator("body")).not.toContainText(/99\.9% uptime|award-winning AI|trusted by \d+/i);
    expect((await request.get("http://127.0.0.1:3002/robots.txt")).ok()).toBeTruthy();
    expect((await request.get("http://127.0.0.1:3002/sitemap.xml")).ok()).toBeTruthy();
  });

  test("homepage review empty state stays short and avoids moderation copy", async ({ page }) => {
    await page.route("**/public/marketing-reviews", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
    await expect(page.getByTestId("approved-marketing-reviews-empty")).toHaveText("No reviews published yet.");
    await expect(page.locator(".mkt-approvedReviews")).not.toContainText(/explicit consent|moderation|invent testimonials|submitted reviews remain private/i);
  });

  test("homepage keeps a readable logo, balanced hero, expandable detail, and compact footer", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    const headerLogo = page.locator(".mkt-commandHeader__brand img");
    await expect(headerLogo).toBeVisible();
    expect((await headerLogo.boundingBox())?.width || 0).toBeGreaterThanOrEqual(200);

    const heroLogo = page.locator(".mkt-billionHero__logo");
    await expect(heroLogo).toBeVisible();
    await expect(heroLogo).toHaveAttribute("src", "/brand/mytitan-logo-dark.svg");
    expect((await heroLogo.boundingBox())?.width || 0).toBeGreaterThanOrEqual(230);

    await expect(page.locator(".mkt-billionHero__signals")).toHaveCount(0);
    await expect(page.locator(".mkt-billionHero__copy")).not.toContainText(/Booking to completion|Proof to customer handoff|Invoice to payment follow-through/i);

    const heroCopy = await page.locator(".mkt-billionHero__copy").boundingBox();
    const commandCentre = await page.getByTestId("marketing-command-centre-preview").boundingBox();
    expect(Math.abs(Number(heroCopy?.height || 0) - Number(commandCentre?.height || 0))).toBeLessThan(80);
    await expect(page.getByTestId("marketing-command-centre-preview")).toContainText("Sample preview");
    await expect(page.getByTestId("marketing-command-centre-preview")).toContainText("Bookings");
    await expect(page.getByTestId("marketing-command-centre-preview")).toContainText("Invoice sent");
    await expect(page.getByTestId("marketing-command-centre-preview")).not.toContainText(/Work in motion|Commercial follow-up|One clear operating view/i);

    const feature = page.locator(".mkt-operatingCard").first();
    await expect(feature).not.toHaveAttribute("open", "");
    await feature.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(feature).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(feature).not.toHaveAttribute("open", "");
    await feature.locator("summary").click();
    await expect(feature).toHaveAttribute("open", "");

    await expect(page.locator(".mkt-operatingCard__number")).toHaveCount(0);
    await expect(page.locator("#mkt-navigation-drawer .mkt-drawer__link > span")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/\b0[1-7]\b/);
    await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
    await expect(page.locator(".mkt-approvedReviews")).not.toContainText(/explicit consent|moderation|invent testimonials|submitted reviews remain private/i);
    for (const heading of ["Product", "Company", "Legal", "Contact", "Account"]) {
      await expect(page.locator(".mkt-siteFooter").getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });

  test("marketing footer stays separated and stacks without horizontal overflow", async ({ page }) => {
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

      const contact = page.locator(".mkt-siteFooter__column--contact");
      const account = page.locator(".mkt-siteFooter__column").filter({ has: page.getByRole("heading", { name: "Account", exact: true }) });
      const contactBox = await contact.boundingBox();
      const accountBox = await account.boundingBox();
      expect(contactBox).toBeTruthy();
      expect(accountBox).toBeTruthy();
      const overlaps = Boolean(
        contactBox && accountBox
        && contactBox.x < accountBox.x + accountBox.width
        && contactBox.x + contactBox.width > accountBox.x
        && contactBox.y < accountBox.y + accountBox.height
        && contactBox.y + contactBox.height > accountBox.y
      );
      expect(overlaps).toBeFalsy();
      await expect(contact.getByRole("link", { name: "support@mytitan.co.uk" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    }
  });

  test("marketing app download popup opens with a real install fallback path", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByTestId("marketing-app-download-open").click();
    await expect(page.getByTestId("marketing-app-download-dialog")).toBeVisible();
    await expect(page.getByTestId("marketing-app-download-fallback")).toContainText(/Add to Home Screen|Install app/i);
    await expect(page.getByTestId("marketing-app-download-dialog")).toContainText(/live app origin/i);
    await expect(page.getByTestId("marketing-app-download-open-live-app")).toHaveAttribute("href", publicAppLoginUrl);
    await expect(page.getByRole("link", { name: /ask about supported install paths/i })).toHaveAttribute("href", "/contact");
  });

  test("marketing manifest file stays host-safe when fetched directly", async ({ request }) => {
    const response = await request.get("http://127.0.0.1:3002/site.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();

    expect(String(manifest?.start_url || "")).toBe("/");
    expect(String(manifest?.scope || "")).toBe("/");
    expect(JSON.stringify(manifest)).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0|api:3000|app:3001|marketing:3002/i);
  });

  test("footer governance routes stay live and clearly marked as operator approved", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
    await expect(page.getByRole("link", { name: "Data retention" })).toHaveAttribute("href", "/data-retention");

    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByTestId("governance-page-privacy")).toContainText(/operator approved/i);

    await page.goto("http://127.0.0.1:3002/terms", { waitUntil: "networkidle" });
    await expect(page.getByTestId("governance-page-terms")).toContainText(/operator approved/i);

    await page.goto("http://127.0.0.1:3002/cookies", { waitUntil: "networkidle" });
    await expect(page.getByTestId("governance-page-cookies")).toContainText(/operator approved/i);

    await page.goto("http://127.0.0.1:3002/data-retention", { waitUntil: "networkidle" });
    await expect(page.getByTestId("governance-page-data-retention")).toContainText(/operator approved/i);
  });
});
