import { test, expect, type Page } from "@playwright/test";

/**
 * The calls number must be recognised under the vocabulary the SERVER actually writes.
 *
 * Provisioning stamps `purpose: "voice"` and TelephonySenderResolver matches outbound calls on
 * `"voice"` — but the nickname DTO could only express `"transactional"`, and this card both read
 * and wrote that. So a freshly provisioned local number never showed as the calls number: the card
 * offered to buy one the organisation already had, and pressing "Use for calls" wrote a value the
 * call path ignores. Real money on duplicate inventory, and calls that still had no sender.
 *
 * These stubs are the two shapes the database can now hold — the canonical "voice" and the legacy
 * "transactional" left on older rows. Both must read as the calls number.
 */
function json(data: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify({ ok: status < 400, data }) };
}

const localNumber = (purpose: string) => ({
  id: "num-local",
  tenantId: "t1",
  phoneNumberE164: "+61255501234",
  phoneNumberSid: "PN" + "1".repeat(32),
  nickname: "Office line",
  status: "ACTIVE",
  numberType: "local",
  purpose,
  capabilities: { voice: true, sms: true },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

async function stubTelephony(page: Page, purpose: string, onPatch?: (b: Record<string, unknown>) => void) {
  await page.route(/\/telephony\/numbers(\?|$)/, (route) => route.fulfill(json([localNumber(purpose)])));
  await page.route(/\/telephony\/runs(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(/\/telephony\/numbers\/[^/]+$/, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = JSON.parse(route.request().postData() || "{}");
    onPatch?.(body);
    return route.fulfill(json(localNumber("voice")));
  });
}

test.describe("telephony — one purpose vocabulary", () => {
  for (const purpose of ["voice", "transactional"]) {
    test(`a local number stamped "${purpose}" reads as the calls number`, async ({ page }) => {
      await stubTelephony(page, purpose);
      await page.goto("/channels/calls", { waitUntil: "domcontentloaded" });

      const card = page.locator("#numbers");
      // The card self-hides when the tenant's telephony flag is off — nothing to assert then.
      const visible = await card.isVisible({ timeout: 20_000 }).catch(() => false);
      test.skip(!visible, "tenant telephony flag off in this environment");

      await expect(card).toContainText("+61255501234");
      // THE assertion: it is already the calls number...
      await expect(card.getByText("Calls number")).toBeVisible({ timeout: 20_000 });
      // ...so the card must NOT invite the organiser to make it one again.
      await expect(card.getByRole("button", { name: "Use for calls" })).toHaveCount(0);
    });
  }

  test('"Use for calls" writes the canonical purpose the call path matches', async ({ page }) => {
    const patches: Array<Record<string, unknown>> = [];
    // A number with no calls purpose at all — the one case where the button belongs.
    await stubTelephony(page, "marketing", (b) => patches.push(b));
    await page.goto("/channels/calls", { waitUntil: "domcontentloaded" });

    const card = page.locator("#numbers");
    const visible = await card.isVisible({ timeout: 20_000 }).catch(() => false);
    test.skip(!visible, "tenant telephony flag off in this environment");

    const button = card.getByRole("button", { name: "Use for calls" });
    const offered = await button.isVisible().catch(() => false);
    test.skip(!offered, "this session cannot provision (owner/organiser only)");

    await button.click();
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    // "transactional" here is the bug: the resolver would never pick the number up.
    expect(patches[0]).toMatchObject({ purpose: "voice" });
  });
});
