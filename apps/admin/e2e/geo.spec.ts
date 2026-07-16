import { test, expect, type Page } from "@playwright/test";

/**
 * The geo (data) explorer. Each kind renders its list/map surface. NOTE: the boundary/address/ABS
 * data isn't loaded in CI (multi-GB, operator-loaded), so these assert the explorer CHROME renders
 * (title, empty-states, controls) rather than specific data — they run fully against a data-loaded
 * env. (gotoOk inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.)
 */
async function gotoOk(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page, `no sign-in bounce from ${path}`).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}

test.describe("geo explorer", () => {
  const KINDS: Array<[string, RegExp]> = [
    ["/data/states", /state|territory|geograph/i],
    ["/data/divisions", /division|electorate|federal|state|local/i],
    ["/data/areas", /area|sa1|sa2|sa3|sa4|meshblock/i],
    ["/data/addresses", /address|search|door|gnaf/i],
    ["/data/demographics", /demograph|indicator|census|seifa|abs/i],
    ["/data/polling-places", /polling|booth|place/i],
    ["/data/first-nations", /first nations|indigenous|region|area/i],
    ["/data/referendum", /referendum|yes|no|voice/i],
    ["/data/datasets", /dataset|loaded|source|abs|geo/i],
  ];

  for (const [route, expected] of KINDS) {
    test(`renders ${route}`, async ({ page }) => {
      await gotoOk(page, route, expected);
    });
  }
});
