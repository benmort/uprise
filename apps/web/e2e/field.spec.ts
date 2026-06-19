import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ctx = JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8"));
const ids = ctx.ids ?? {};
async function authed(page: Page) {
  await page.addInitScript(
    ([u, p, cid]) => {
      try {
        window.sessionStorage.setItem("yarn_auth_credentials", JSON.stringify({ username: u, password: p }));
      } catch {}
      try {
        if (cid) window.localStorage.setItem("yarns.canvasserId", cid);
      } catch {}
    },
    [ctx.user, ctx.pass, ids.canvasserId ?? ""],
  );
}
test.beforeEach(async ({ page }) => authed(page));

/** Field canvasser PWA — the demo canvasser id is injected so the assigned turf renders. */
test("field home renders", async ({ page }) => {
  await page.goto("/field", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).toBeVisible();
});

test("field sync centre renders", async ({ page }) => {
  await page.goto("/field/me", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).toBeVisible();
});

test("walk map + door render with seeded turf", async ({ page }) => {
  test.skip(!ids.turfId, "no seeded turf assigned to demo canvasser");
  await page.goto(`/field/${ids.turfId}`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  if (ids.stopId) {
    await page.goto(`/field/${ids.turfId}/door/${ids.stopId}`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
  }
});
