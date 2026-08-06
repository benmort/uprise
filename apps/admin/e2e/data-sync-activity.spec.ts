import { test, expect, type Page } from "@playwright/test";

/**
 * The Sync activity card — the write-back's transparency surface. Stub posture matches
 * the other data-sync specs: `/integrations/*` stubbed in the browser, everything
 * between the fetch and the pixels is the real app. What must hold: the stream toggles
 * PATCH the connection's settings, a FAILED delivery shows its reason, Retry queues it
 * back and the row flips to QUEUED.
 */
const CONNECTION_ID = "e2e-nb-conn";

function json(data: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify({ ok: status < 400, data }) };
}

const connection = (pushEnabled: boolean) => ({
  id: CONNECTION_ID,
  type: "NATION_BUILDER",
  name: "castle-hill",
  group: "castle-hill",
  status: "ACTIVE",
  settings: {
    baseUrl: "https://castle-hill.nationbuilder.com",
    dataSync: { push: { enabled: pushEnabled, streams: { textReplies: false } } },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const failedDelivery = {
  id: "del-1",
  tenantId: "t1",
  connectionId: CONNECTION_ID,
  eventId: "evt-1",
  eventType: "canvass.disposition.set",
  stream: "disposition",
  contactId: "c1",
  externalPersonId: null,
  status: "FAILED",
  attempts: 10,
  requestSummary: null,
  responseSummary: null,
  skipReason: null,
  lastError: "502 Bad Gateway from nationbuilder",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};

async function stubActivity(
  page: Page,
  opts: { onPatch?: (body: Record<string, unknown>) => void; onRetry?: () => void } = {},
) {
  let pushEnabled = true;
  await page.route(/\/integrations\/connections$/, (route) => route.fulfill(json([connection(pushEnabled)])));
  await page.route(/\/integrations\/connections\/[^/]+\/settings$/, (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    opts.onPatch?.(body);
    if (body?.push?.enabled !== undefined) pushEnabled = body.push.enabled;
    return route.fulfill(json({ push: { enabled: pushEnabled } }));
  });
  // Pull card needs its list search to settle.
  await page.route(/\/integrations\/lists\/search/, (route) => route.fulfill(json({ lists: [] })));
  await page.route(/\/integrations\/sync-jobs/, (route) => route.fulfill(json([])));
  let retried = false;
  await page.route(/\/integrations\/push-deliveries\?/, (route) =>
    route.fulfill(
      json({ rows: [retried ? { ...failedDelivery, status: "PENDING" } : failedDelivery], total: 1 }),
    ),
  );
  await page.route(/\/integrations\/push-deliveries\/[^/]+\/retry$/, (route) => {
    retried = true;
    opts.onRetry?.();
    return route.fulfill(json({ queued: true }));
  });
}

test.describe("Data sync activity", () => {
  test("stream toggles PATCH the connection; opt-outs are immovable", async ({ page }) => {
    const patches: Array<Record<string, unknown>> = [];
    await stubActivity(page, { onPatch: (b) => patches.push(b) });
    await page.goto("/audience/sync", { waitUntil: "domcontentloaded" });

    const card = page.locator("#data-sync-activity");
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Opt-outs render checked AND disabled — a STOP always reaches the CRM.
    const optOuts = card.getByRole("switch", { name: "Opt-outs (always on)" });
    await expect(optOuts).toBeDisabled();

    // Turning a stream off PATCHes exactly that stream.
    await card.getByRole("switch", { name: "Survey answers" }).click();
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches[0]).toEqual({ push: { streams: { surveyAnswers: false } } });
  });

  test("a FAILED delivery shows its reason and Retry flips it back to QUEUED", async ({ page }) => {
    let retried = false;
    await stubActivity(page, { onRetry: () => (retried = true) });
    await page.goto("/audience/sync", { waitUntil: "domcontentloaded" });

    const card = page.locator("#data-sync-activity");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Door-knock outcome");
    await expect(card).toContainText("502 Bad Gateway from nationbuilder");

    await card.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => retried, { timeout: 10_000 }).toBe(true);
    // StatusBadge renders title-case; the FAILED row has flipped to the queued state.
    await expect(card).toContainText(/queued/i);
    await expect(card).not.toContainText(/failed/i);
  });
});
