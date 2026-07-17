import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canvasser PWA (apps/field, :3005) as the demo VOLUNTEER. Uses the volunteer storageState minted
 * by global-setup (session cookie + `uprise.volunteerId` on the field origin), so the assigned turf
 * resolves. Navigates the field app absolutely — a separate origin from the admin baseURL.
 * (consts inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.)
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const FIELD_URL = process.env.FIELD_URL || (IS_NGROK ? "https://field.dev.uprise.org.au" : "http://localhost:3005");
const VOLUNTEER_STATE = resolve(__dirname, ".auth/volunteer.json");
const ids: Record<string, string | undefined> = (() => {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8")).ids ?? {};
  } catch {
    return {};
  }
})();

test.use({ storageState: VOLUNTEER_STATE });

const NO_BOUNCE = /\/sign-in|\/login/;

test.describe("field PWA — volunteer", () => {
  test("assignments home renders without an auth bounce", async ({ page }) => {
    await page.goto(`${FIELD_URL}/field`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(NO_BOUNCE);
    await expect(page.locator("body")).toBeVisible();
  });

  test("get-turf (self-serve claim) renders", async ({ page }) => {
    await page.goto(`${FIELD_URL}/field/get-turf`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(NO_BOUNCE);
    await expect(page.locator("body")).toContainText(/turf/i, { timeout: 20_000 });
  });

  test("sync centre renders", async ({ page }) => {
    await page.goto(`${FIELD_URL}/field/me`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(NO_BOUNCE);
    await expect(page.locator("body")).toBeVisible();
  });

  test("walk view + door entry for the seeded turf", async ({ page }) => {
    test.skip(!ids.turfId, "no seeded turf assigned to the demo volunteer");
    await page.goto(`${FIELD_URL}/field/${ids.turfId}`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(NO_BOUNCE);
    await expect(page.locator("body")).toContainText(/stop|door|walk|turf|list|map/i, { timeout: 20_000 });

    if (ids.stopId) {
      await page.goto(`${FIELD_URL}/field/${ids.turfId}/door/${ids.stopId}`, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(NO_BOUNCE);
      await expect(page.locator("body")).toContainText(/door|disposition|knock|survey|resident|happened|home/i, {
        timeout: 20_000,
      });
    }
  });
});
