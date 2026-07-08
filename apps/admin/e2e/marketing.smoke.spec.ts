import { test, expect } from "@playwright/test";

/**
 * Marketing site smoke (meld doc 12 / prog marketing.smoke). Public — no session.
 * Drives the apps/product-marketing app (port 3003) via absolute URLs.
 */
const MKT = process.env.MARKETING_URL || "http://localhost:3003";

test.use({ storageState: { cookies: [], origins: [] } });

test("landing renders the hero + primary CTAs", async ({ page }) => {
  await page.goto(`${MKT}/`);
  await expect(page.getByRole("heading", { name: /built for progress/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i }).first()).toBeVisible();
});

test("plans page shows the three tiers", async ({ page }) => {
  await page.goto(`${MKT}/plans`);
  // Tier names appear in both the pricing cards and the comparison table.
  await expect(page.getByText("Starter").first()).toBeVisible();
  await expect(page.getByText("Growth").first()).toBeVisible();
  await expect(page.getByText("Scale").first()).toBeVisible();
});

test("request-demo + contact forms render", async ({ page }) => {
  // The footer newsletter also has an email input, so scope to the first (the form).
  await page.goto(`${MKT}/request-demo`);
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await page.goto(`${MKT}/contact-us`);
  await expect(page.locator("textarea").first()).toBeVisible();
});
