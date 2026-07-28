import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The canvass lifecycle for the seeded demo campaign: the campaign-scoped ops pages render, and the
 * campaign-less aggregates roll up across campaigns. Deep assertions gate on the seeded campaignId.
 * (ids + gotoOk inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.)
 */
const ids: Record<string, string | undefined> = (() => {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8")).ids ?? {};
  } catch {
    return {};
  }
})();

async function gotoOk(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page, `no sign-in bounce from ${path}`).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}

test.describe("canvass — campaign lifecycle", () => {
  test("the campaigns overview renders", async ({ page }) => {
    await gotoOk(page, "/canvass", /campaign|canvass|turf|cut turf|new campaign/i);
  });

  test("the new-campaign form renders", async ({ page }) => {
    await gotoOk(page, "/canvass/new", /campaign|name|create|doors|conversations/i);
  });

  test("campaign-scoped ops pages render for the seeded campaign", async ({ page }) => {
    test.skip(!ids.campaignId, "no seeded campaign");
    const id = ids.campaignId!;
    for (const [sub, expected] of [
      ["turf", /turf|area|draw|cut/i],
      ["walklists", /walk list|route|turf|stop/i],
      ["volunteers", /volunteer|invite|assign/i],
      ["results", /result|disposition|support|funnel|door/i],
      ["qa", /quality|flag|review|qa/i],
      ["goals", /goal|target|pace|doors/i],
      ["shifts", /shift|schedule/i],
      ["live", /live|war room|out|doors|volunteers/i],
    ] as const) {
      await gotoOk(page, `/canvass/${id}/${sub}`, expected);
    }
  });

  test("the campaign-less aggregates render across all campaigns", async ({ page }) => {
    for (const [route, expected] of [
      ["/canvass/results", /result|disposition|support|funnel|door/i],
      ["/canvass/walklists", /walk list|turf|route/i],
      ["/canvass/shifts", /shift|schedule/i],
      ["/canvass/live", /live|out|doors|volunteers/i],
      ["/canvass/volunteers", /volunteer|invite/i],
    ] as const) {
      await gotoOk(page, route, expected);
    }
  });

  /**
   * The campaign-less /canvass/qa was folded into the insights surface — it now redirects
   * rather than 404ing. (The campaign-SCOPED /canvass/:id/qa is still its own page and is
   * covered above.) Asserting the redirect keeps the old entry point honest.
   */
  test("the campaign-less /canvass/qa redirects to the insights surface", async ({ page }) => {
    await page.goto("/canvass/qa", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/canvass\/insights/, { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/insight|disposition|support/i, { timeout: 20_000 });
  });

  /** Campaign-scoped surfaces that the ops loop above doesn't reach. */
  test("campaign boundary + insights render for the seeded campaign", async ({ page }) => {
    test.skip(!ids.campaignId, "no seeded campaign");
    const id = ids.campaignId!;
    await gotoOk(page, `/canvass/${id}/boundary`, /boundary|campaign|area|map|draw/i);
    await gotoOk(page, `/canvass/${id}/insights`, /insight|disposition|support|breakdown/i);
  });

  /** The turf planner sizes turf by density — a standalone canvass tool with no cover. */
  test("the turf planner renders its sizing model", async ({ page }) => {
    await gotoOk(page, "/canvass/planner", /turf planner|door goal|densit|shift/i);
  });
});
