import { test, expect, type Page } from "@playwright/test";

/**
 * Nav route matrix — smoke-navigate every live organiser route and assert it stays authed and
 * renders its surface. Auth is the storageState cookie from global-setup (no client-side injection).
 * Canvass, geo, inbox/blasts and field journeys have their own deeper specs; this is the broad
 * "every top-level route renders" net. (gotoOk is inlined — no shared local .ts import; the
 * Playwright Node-23 loader trips on those, per the config header.)
 */
async function gotoOk(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page, `no sign-in bounce from ${path}`).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}

const STATIC_ROUTES: Array<[string, RegExp]> = [
  ["/dashboard", /dashboard|overview|command|today/i],
  ["/inbox", /inbox|conversation|message|all|no messages/i],
  ["/audience", /audience|contacts|members|no audiences/i],
  ["/channels/text", /text|sms|message|blast|send/i],
  ["/channels/calls", /call|dial|phone|number|softphone/i],
  ["/content/surveys", /survey/i],
  ["/content/scripts", /script/i],
  ["/content/dispositions", /disposition/i],
  ["/content/canned-responses", /canned|response|reply/i],
  ["/compliance", /complian|opt.?out|consent/i],
  ["/settings", /setting/i],
  ["/settings/team", /team|member|invite|join request/i],
];

for (const [route, expected] of STATIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    await gotoOk(page, route, expected);
  });
}
