import { test, expect, type Page } from "@playwright/test";

/**
 * Proven past defects in the blast composer, pinned at the browser level.
 *
 * Both were invisible to unit tests and to the existing e2e specs, because both specs assert that
 * a REQUEST was made rather than what the organiser ends up looking at. Stub posture matches the
 * other data-stubbed specs: the blast endpoints are stubbed in the browser, everything between the
 * fetch and the pixels is the real app.
 */

const BLAST_ID = "e2e-old-blast";
const WA_BLAST_ID = "e2e-wa-blast";

function json(data: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify({ ok: status < 400, data }) };
}

const blastRow = (over: Record<string, unknown> = {}) => ({
  id: BLAST_ID,
  tenantId: "t1",
  title: "Older blast that fell off the list",
  audienceId: null,
  bodyTemplate: "Hi {{first_name}}, reply STOP to opt out.",
  status: "DRAFTED",
  channel: "SMS",
  contentSid: null,
  fromNumberId: null,
  campaignId: null,
  metadata: null,
  contentVariableMap: null,
  scheduledAt: null,
  createdAt: new Date("2026-01-01").toISOString(),
  updatedAt: new Date("2026-01-01").toISOString(),
  _count: { recipients: 0 },
  ...over,
});

/**
 * A list of a hundred OTHER blasts — exactly what the API returns, since listBlasts hardcodes
 * `take: 100` and ignores pagination. The blast under test is deliberately absent from it.
 */
const hundredOthers = Array.from({ length: 100 }, (_, i) =>
  blastRow({ id: `other-${i}`, title: `Other blast ${i}` }),
);

test.describe("blast composer — past defects", () => {
  /**
   * The composer resolved a blast by SCANNING the capped list, so any blast past the hundredth
   * showed "Blast not found" at a URL naming a real blast, rendered an empty form, and the first
   * autosave took the `if (!blastId)` branch and created a DUPLICATE draft.
   *
   * The stub reproduces that shape exactly: the list has a hundred rows, none of them this blast,
   * and GET /blasts/:id returns it. A composer that reads the list fails; one that fetches by id
   * renders the title.
   */
  test("opens a blast that is NOT in the capped list", async ({ page }) => {
    let byIdFetches = 0;
    await page.route(/\/blasts$/, (route) => route.fulfill(json(hundredOthers)));
    await page.route(new RegExp(`/blasts/${BLAST_ID}$`), (route) => {
      byIdFetches += 1;
      return route.fulfill(json(blastRow()));
    });

    await page.goto(`/blasts/${BLAST_ID}/composer`, { waitUntil: "domcontentloaded" });

    // The form is populated from the blast itself...
    await expect(page.locator('input[placeholder="Campaign name"]')).toHaveValue(
      "Older blast that fell off the list",
      { timeout: 20_000 },
    );
    // ...and the not-found message the organiser used to get is absent.
    await expect(page.locator("body")).not.toContainText("Blast not found");
    expect(byIdFetches).toBeGreaterThan(0);
  });

  /**
   * Opening a saved WhatsApp blast silently re-pointed it at a different audience.
   *
   * The blast resolves BEFORE the audience list arrives, so `setChannel("WHATSAPP")` flipped
   * `isWhatsapp` while `audiences` was still `[]`. The narrowing effect read that empty list,
   * decided the blast's own audience "isn't valid for WhatsApp", and wiped it; the list then landed
   * and the default-picker filled the blank with whatever was first — which autosave persisted.
   *
   * Delaying the audience list makes that ordering deterministic rather than a race.
   */
  test("keeps its own audience when the audience list arrives late", async ({ page }) => {
    const wrongAudience = { id: "aud-first", name: "First audience", whatsappCapable: true };
    const blastAudience = { id: "aud-blast", name: "The blast's audience", whatsappCapable: true };
    const patchedAudienceIds: Array<unknown> = [];

    await page.route(/\/blasts$/, (route) => route.fulfill(json([])));
    await page.route(new RegExp(`/blasts/${WA_BLAST_ID}$`), (route) =>
      route.fulfill(
        json(blastRow({ id: WA_BLAST_ID, channel: "WHATSAPP", audienceId: blastAudience.id, title: "WA blast" })),
      ),
    );
    // Record what autosave writes — the duplicate-audience bug showed up HERE, not on screen.
    await page.route(new RegExp(`/blasts/${WA_BLAST_ID}$`), async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const body = JSON.parse(route.request().postData() || "{}");
      patchedAudienceIds.push(body.audienceId);
      return route.fulfill(json(blastRow({ id: WA_BLAST_ID })));
    });
    // The list lands AFTER the blast — the ordering that triggered the bug.
    await page.route(/\/audiences(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 1_200));
      return route.fulfill(json({ rows: [wrongAudience, blastAudience], total: 2 }));
    });

    await page.goto(`/blasts/${WA_BLAST_ID}/composer`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[placeholder="Campaign name"]')).toHaveValue("WA blast", {
      timeout: 20_000,
    });

    // Give the late list time to land and any autosave to fire.
    await page.waitForTimeout(3_000);

    // Nothing may have re-pointed the blast at the first audience.
    expect(patchedAudienceIds).not.toContain(wrongAudience.id);
  });
});
