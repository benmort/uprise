import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Messaging surfaces: the unified inbox, the audience list, and a blast's composer.
 *  (ids + gotoOk inlined — no shared local .ts import; the Node-23 Playwright loader trips on those.) */
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

test.describe("inbox + blasts + audience", () => {
  test("the shared inbox renders", async ({ page }) => {
    await gotoOk(page, "/inbox", /inbox|conversation|message|all|unresolved|no messages/i);
  });

  test("the audience list renders", async ({ page }) => {
    await gotoOk(page, "/audience", /audience|contacts|members|import|no audiences/i);
  });

  test("the calls + text channels render", async ({ page }) => {
    await gotoOk(page, "/channels/calls", /call|dial|phone|number|softphone/i);
    await gotoOk(page, "/channels/text", /text|sms|message|blast|send/i);
  });

  test("the blast composer renders for the seeded blast", async ({ page }) => {
    test.skip(!ids.blastId, "no seeded blast");
    await gotoOk(page, `/blasts/${ids.blastId}/composer`, /compose|message|template|audience|send|preview/i);
    await expect(page.getByRole("button", { name: /send|schedule/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("a specific audience detail renders", async ({ page }) => {
    test.skip(!ids.audienceId, "no seeded audience");
    await gotoOk(page, `/audience/${ids.audienceId}`, /audience|member|contact|growth|import/i);
  });
});
