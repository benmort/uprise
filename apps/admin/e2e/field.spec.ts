import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Canvasser PWA (apps/field, :3005) as the demo VOLUNTEER. Uses the volunteer storageState minted
 * by global-setup (session cookie + `uprise.volunteerId` on the field origin), so the assigned turf
 * resolves. Navigates the field app absolutely — a separate origin from the admin baseURL.
 * (consts inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.)
 *
 * ROUTES ARE ROOT-LEVEL. apps/field owns the whole origin, so its pages are `/`, `/me`,
 * `/get-turf`, `/shifts`, `/texts`, `/:turfId` — there is no `/field` prefix. These specs used to
 * carry one and so drove 404s; they passed anyway because the 404 page renders the location-
 * permission banner ("…so your walk list and turf show the right spots"), which satisfied loose
 * /turf|door|walk/ regexes. Every assertion below is therefore anchored to text unique to the real
 * page, and each asserts the 404 body is absent.
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

/** Every field page must be the real page — not the Next 404, whose banner text fuzzy-matches. */
async function fieldGoto(page: import("@playwright/test").Page, path: string, expected: RegExp) {
  await page.goto(`${FIELD_URL}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page, `auth bounce from ${path}`).not.toHaveURL(NO_BOUNCE);
  await expect(page.locator("body"), `${path} rendered the 404 page`).not.toContainText(/could not be found/i);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}

test.describe("field PWA — volunteer", () => {
  test("assignments home shows today's counters and the walk list", async ({ page }) => {
    await fieldGoto(page, "/", /doors today|walk list|start walking/i);
  });

  test("get-turf (self-serve claim) renders", async ({ page }) => {
    await fieldGoto(page, "/get-turf", /get turf|campaign link/i);
  });

  test("sync centre shows the assigned turf and sync state", async ({ page }) => {
    await fieldGoto(page, "/me", /data sync|sync now|log out/i);
  });

  test("walk view + door entry for the seeded turf", async ({ page }) => {
    test.skip(!ids.turfId, "no seeded turf assigned to the demo volunteer");
    await fieldGoto(page, `/${ids.turfId}`, /stops done|list|map|walking route/i);

    if (ids.stopId) {
      await fieldGoto(page, `/${ids.turfId}/door/${ids.stopId}`, /door|disposition|knock|survey|resident|home/i);
    }
  });

  /** Shifts, text banks and the offline fallback — real pages with no previous cover. */
  test("shifts, text banks and the offline fallback render", async ({ page }) => {
    await fieldGoto(page, "/shifts", /upcoming shifts|available shifts/i);
    await fieldGoto(page, "/texts", /text bank/i);
    await fieldGoto(page, "/offline", /offline|reconnect/i);
  });
});
