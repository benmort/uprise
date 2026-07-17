import { test, expect } from "@playwright/test";

/**
 * The standalone auth/SSO app (:3002). All specs run UNAUTHENTICATED (these are the pre-login
 * screens). The headline is the real organiser sign-in journey: fill the form → the API mints the
 * cookie → land on the admin dashboard. The rest smoke each identity screen renders.
 * (AUTH_APP_URL inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.)
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const AUTH_APP_URL =
  process.env.NEXT_PUBLIC_AUTH_APP_URL || (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");
const DEMO_ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("auth app — screens render", () => {
  const SCREENS: Array<[string, RegExp]> = [
    ["/sign-in", /sign in|log in|email|password/i],
    ["/sign-in/magic-link", /magic|link|email/i],
    ["/sign-up", /sign up|create|account|register|email/i],
    ["/reset-password", /reset|password|email/i],
    ["/volunteer", /volunteer|join|sign in/i],
    ["/volunteer/join", /volunteer|join|name|mobile|phone/i],
    ["/volunteer/code", /code|join|volunteer/i],
    ["/volunteer/sign-in", /volunteer|sign in|mobile|phone|email/i],
  ];
  for (const [path, expected] of SCREENS) {
    test(`renders ${path}`, async ({ page }) => {
      await page.goto(`${AUTH_APP_URL}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
    });
  }
});

test.describe("auth app — organiser sign-in journey", () => {
  test("email/password sign-in mints a session and reaches the admin dashboard", async ({ page }) => {
    await page.goto(`${AUTH_APP_URL}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(DEMO_ORGANISER.email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(DEMO_ORGANISER.password);
    await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
    // The API sets the cross-subdomain cookie and redirects into the admin app.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.locator("body")).toBeVisible();
  });
});
