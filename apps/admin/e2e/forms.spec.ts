import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ctx = JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8"));
const ids = ctx.ids ?? {};
async function authed(page: Page) {
  await page.addInitScript(
    ([u, p]) => {
      try {
        window.sessionStorage.setItem("yarn_auth_credentials", JSON.stringify({ username: u, password: p }));
      } catch {}
    },
    [ctx.user, ctx.pass],
  );
}
test.beforeEach(async ({ page }) => authed(page));

/** Drive the shared form-kit dialogs end-to-end. Unique names avoid re-run collisions. */
const stamp = () => `${Date.now()}`;

test("create a disposition via the dialog", async ({ page }) => {
  await page.goto("/engagement/dispositions", { waitUntil: "domcontentloaded" });
  const label = `E2E Disp ${stamp()}`;
  await page.getByRole("button", { name: /add code/i }).click();
  await page.locator("#disp-label").fill(label);
  await page.getByRole("button", { name: /^Add$/ }).click();
  await expect(page.locator("body")).toContainText(label, { timeout: 15_000 });
});

test("create a canned response via the dialog", async ({ page }) => {
  await page.goto("/engagement/canned-responses", { waitUntil: "domcontentloaded" });
  const title = `E2E Canned ${stamp()}`;
  await page.getByRole("button", { name: /new canned response/i }).click();
  await page.locator("#cr-title").fill(title);
  await page.locator("#cr-body").fill("Automated e2e canned body.");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await expect(page.locator("body")).toContainText(title, { timeout: 15_000 });
});

test("create a survey via the dialog", async ({ page }) => {
  await page.goto("/engagement/surveys", { waitUntil: "domcontentloaded" });
  const name = `E2E Survey ${stamp()}`;
  await page.getByRole("button", { name: /new survey/i }).first().click();
  await page.locator("#survey-name").fill(name);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("body")).toContainText(name, { timeout: 15_000 });
});

test("create a script via the dialog", async ({ page }) => {
  await page.goto("/engagement/scripts", { waitUntil: "domcontentloaded" });
  const name = `E2E Script ${stamp()}`;
  await page.getByRole("button", { name: /new script/i }).first().click();
  await page.locator("#script-name").fill(name);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("body")).toContainText(name, { timeout: 15_000 });
});

test("create a campaign via the dialog", async ({ page }) => {
  await page.goto("/canvass", { waitUntil: "domcontentloaded" });
  const name = `E2E Campaign ${stamp()}`;
  await page.getByRole("button", { name: /new campaign/i }).first().click();
  await page.locator("#camp-name").fill(name);
  await page.getByRole("button", { name: /^Create$/ }).click();
  await expect(page.locator("body")).toContainText(/campaign created|E2E Campaign/i, { timeout: 15_000 });
});

test("schedule a shift via the form", async ({ page }) => {
  test.skip(!ids.campaignId, "no seeded campaign");
  await page.goto(`/canvass/${ids.campaignId}/shifts`, { waitUntil: "domcontentloaded" });
  const name = `E2E Shift ${stamp()}`;
  await page.locator("#shift-name").fill(name);
  await page.locator("#shift-loc").fill("E2E HQ");
  await page.locator("#shift-start").fill("2026-09-01T09:00");
  await page.locator("#shift-end").fill("2026-09-01T12:00");
  await page.getByRole("button", { name: /add shift/i }).click();
  await expect(page.locator("body")).toContainText(name, { timeout: 15_000 });
});
