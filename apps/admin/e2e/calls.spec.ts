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

// Drives the softphone entry points (the dialog + the volunteer Call button). It does
// NOT click "Call" — placing a real bridged call would create Twilio resources / dial a
// number. The token/TwiML/audio path is covered by API unit tests.
test("new call dialog opens and switches between number + contact modes", async ({ page }) => {
  await page.goto("/channels/calls", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /new call/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Number mode formats an AU mobile as you type.
  await dialog.getByRole("button", { name: /^Number$/ }).click();
  await page.locator("#call-number").fill("0400000123");
  await expect(page.locator("#call-number")).toHaveValue("0400 000 123");

  // Contact mode searches the seeded contacts (tolerate zero results).
  await dialog.getByRole("button", { name: /^Contact$/ }).click();
  await page.locator("#call-contact").fill("Ada");
  await page.waitForTimeout(600);

  await dialog.getByRole("button", { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
});

test("volunteers roster shows the mobile column + a call button per volunteer", async ({ page }) => {
  await page.goto("/canvass/volunteers", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("columnheader", { name: /mobile/i }).first()).toBeVisible({ timeout: 15_000 });
  // One Call button per volunteer row (none when the roster is empty — tolerate that).
  const callButtons = page.getByRole("button", { name: /^Call$/ });
  if (await callButtons.count()) await expect(callButtons.first()).toBeVisible();
});
