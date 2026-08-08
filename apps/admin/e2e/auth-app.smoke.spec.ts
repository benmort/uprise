import { test } from "./fixtures";
import { expect } from "@playwright/test";

/**
 * Standalone auth app smoke (meld doc 12 / prog auth.smoke). Public — no session.
 * Drives apps/auth (port 3002, or auth.dev.uprise.org.au on the tunnel) via absolute URLs.
 * (E2E_TARGET defaulting inlined, mirroring playwright.config — a shared local .ts import
 * trips Playwright's TS loader on Node 23.)
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const AUTH =
  process.env.NEXT_PUBLIC_AUTH_APP_URL || (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");

test.use({ storageState: { cookies: [], origins: [] } });

test("sign-in renders the password form", async ({ page }) => {
  await page.goto(`${AUTH}/sign-in`);
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

test("sign-up renders the organisation-setup step", async ({ page }) => {
  await page.goto(`${AUTH}/sign-up`);
  // Step 1 of the two-step wizard: `step === 1 ? "Organisation setup" : "Personal info"`.
  await expect(page.getByRole("heading", { name: /organisation setup/i })).toBeVisible();
  await expect(page.locator("body")).toContainText(/step 1 of 2/i);
});

test("account-recovery renders", async ({ page }) => {
  await page.goto(`${AUTH}/account-recovery`);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

/**
 * Negative path: bad credentials must be rejected in place. The regression this guards is a
 * failed sign-in that still navigates (or silently no-ops) — the user must stay on /sign-in
 * and never reach the admin app.
 */
test("sign-in with a wrong password keeps the user on the auth app", async ({ page }) => {
  await page.goto(`${AUTH}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill("demo.organiser@uprise.test");
  await page.locator('input[type="password"]').first().fill("definitely-not-the-password");
  await page.getByRole("button", { name: /sign in/i }).first().click();
  // Give any redirect a chance to fire, then assert we neither left the auth app nor
  // reached a dashboard.
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/dashboard/);
});
