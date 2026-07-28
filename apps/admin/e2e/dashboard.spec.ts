import { test, expect, type Page } from "@playwright/test";

// Inlined (no shared local .ts import — Playwright's Node-23 loader trips on those; see the config
// header + auth.spec, which do the same).
async function gotoOk(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page, `no sign-in bounce from ${path}`).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}

/** The organiser lands on the dashboard and sees its overview surface (KPIs / activity). */
test.describe("dashboard", () => {
  test("renders the overview + KPIs", async ({ page }) => {
    await gotoOk(page, "/dashboard", /dashboard|overview|command|today|doors|conversations|contacts/i);
  });

  test("the root resolves to the dashboard when authed", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  /** The onboarding checklist a new workspace lands on — step progress, not just chrome. */
  test("getting-started renders the onboarding checklist with step progress", async ({ page }) => {
    await gotoOk(page, "/getting-started", /getting started|steps done|verify your email/i);
    await expect(page.locator("body")).toContainText(/\d+ of \d+ steps done|\d+\/\d+/i, { timeout: 20_000 });
  });
});
