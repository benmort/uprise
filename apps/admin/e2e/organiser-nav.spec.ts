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
        if (cid) window.localStorage.setItem("uprise.volunteerId", cid);
      } catch {}
    },
    [ctx.user, ctx.pass, ids.volunteerId ?? ""],
  );
}
test.beforeEach(async ({ page }) => authed(page));

/** Smoke-navigate every organiser route; assert it stays authed + renders a heading. */
const STATIC_ROUTES: Array<[string, RegExp]> = [
  ["/dashboard", /dashboard|command|overview/i],
  ["/audience", /audience/i],
  ["/analytics", /analytic|performance|blast/i],
  ["/inbox", /conversation|inbox/i],
  ["/canvass", /canvass/i],
  ["/canvass/new", /campaign/i],
  ["/canvass/volunteers", /volunteer/i],
  ["/canvass/divisions", /division/i],
  ["/canvass/areas", /area/i],
  ["/engagement", /engagement|survey|script|disposition/i],
  ["/engagement/dispositions", /disposition/i],
  ["/engagement/canned-responses", /canned/i],
  ["/engagement/surveys", /survey/i],
  ["/engagement/scripts", /script/i],
  ["/journeys", /journey/i],
  ["/compliance", /complian|opt.?out/i],
  ["/settings", /setting/i],
  ["/settings/integrations", /integration/i],
  ["/settings/roles", /role/i],
  ["/settings/data", /data|dataset|geo/i],
  ["/channels/text", /text|sms|channel/i],
  ["/channels/whatsapp", /whatsapp|channel/i],
];

for (const [route, expected] of STATIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page, `should not bounce to /login from ${route}`).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
  });
}

test("dynamic routes render with seeded ids", async ({ page }) => {
  if (ids.campaignId) {
    for (const sub of ["turf", "walklists", "live", "results", "goals", "shifts", "qa"]) {
      await page.goto(`/canvass/${ids.campaignId}/${sub}`, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/);
    }
  }
  if (ids.contactId) {
    await page.goto(`/contacts/${ids.contactId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
  }
  if (ids.audienceId) {
    await page.goto(`/audience/${ids.audienceId}`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
  }
  if (ids.blastId) {
    await page.goto(`/blasts/${ids.blastId}`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
  }
});
