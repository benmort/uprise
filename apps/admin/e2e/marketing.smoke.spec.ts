import { test, expect } from "@playwright/test";

/**
 * Marketing site smoke (meld doc 12 / prog marketing.smoke). Public — no session.
 * Drives the apps/product-marketing app (port 3003) via absolute URLs.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const MKT = process.env.MARKETING_URL || (IS_NGROK ? "https://dev.uprise.org.au" : "http://localhost:3003");

test.use({ storageState: { cookies: [], origins: [] } });

test("landing renders the hero + primary CTAs", async ({ page }) => {
  await page.goto(`${MKT}/`);
  // The cinema opening's headline. Word-masked, so assert on the h1's text rather than an
  // accessible name built from one span.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/every channel/i);
  await expect(page.getByRole("link", { name: /start a campaign/i }).first()).toBeVisible();
});

test("plans page shows the two quoted tiers", async ({ page }) => {
  await page.goto(`${MKT}/plans`);
  // Public pricing is Grassroots + Scale. Starter and Growth are publiclyVisible: false —
  // hidden, not removed, so networks already on them keep their entitlements.
  await expect(page.getByText("Grassroots").first()).toBeVisible();
  await expect(page.getByText("Scale").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /apply with us/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /talk to us/i }).first()).toBeVisible();
});

test("apply page renders the grassroots application form", async ({ page }) => {
  await page.goto(`${MKT}/apply`);
  await expect(page.getByRole("heading", { name: /rationed by budget/i })).toBeVisible();
  await expect(page.getByLabel(/organisation/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /send application/i })).toBeVisible();
});

test("request-demo + contact forms render", async ({ page }) => {
  // The footer newsletter also has an email input, so scope to the first (the form).
  await page.goto(`${MKT}/request-demo`);
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await page.goto(`${MKT}/contact-us`);
  await expect(page.locator("textarea").first()).toBeVisible();
});

/**
 * The resources + policies route groups. `/privacy-policy` matters beyond a smoke test: a
 * reachable, current privacy policy is a compliance obligation, not decoration.
 */
test("resources + policy pages render", async ({ page }) => {
  for (const [path, expected] of [
    ["/about-us", /about uprise|campaigning platform/i],
    ["/integrations", /integration|lists|data/i],
    ["/support-centre", /support|help/i],
    ["/privacy-policy", /privacy policy/i],
  ] as const) {
    await page.goto(`${MKT}${path}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body"), `${path} 404'd`).not.toContainText(/could not be found/i);
    await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
  }
});
