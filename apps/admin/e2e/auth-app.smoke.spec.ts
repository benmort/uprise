import { test, expect } from "@playwright/test";

/**
 * Standalone auth app smoke (meld doc 12 / prog auth.smoke). Public — no session.
 * Drives apps/auth (port 3002) via absolute URLs.
 */
const AUTH = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";

test.use({ storageState: { cookies: [], origins: [] } });

test("sign-in renders the password form", async ({ page }) => {
  await page.goto(`${AUTH}/sign-in`);
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

test("sign-up renders the create-workspace step", async ({ page }) => {
  await page.goto(`${AUTH}/sign-up`);
  await expect(page.getByRole("heading", { name: /create your workspace/i })).toBeVisible();
});

test("account-recovery renders", async ({ page }) => {
  await page.goto(`${AUTH}/account-recovery`);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});
