import { test } from "./fixtures";
import { expect, type Page } from "@playwright/test";

/**
 * The NationBuilder first-run journey on Data sync — connect a nation from the empty
 * state, browse its lists AND its tags, sync one, and land on the success panel with
 * its counts line and tool CTAs.
 *
 * Same stub posture as audience-action-network.spec.ts (read its header for the why):
 * no CI environment holds a live nation or its token, so `/integrations/*` responses
 * are stubbed in the browser and everything between the fetch and the pixels is the
 * real app. The connect dialog's test-then-save order is asserted via the stubbed
 * calls — a token that fails the test must store nothing.
 */
const CONNECTION_ID = "e2e-nb-connection";
const AUDIENCE_ID = "e2e-nb-audience";
const SYNC_JOB_ID = "e2e-nb-job";

const NB_LISTS = [
  { id: "31", name: "Doorknock volunteers", count: 1204, source: "NATION_BUILDER" },
  { id: "32", name: "Donors 2026", count: 233, source: "NATION_BUILDER" },
];
const NB_TAGS = [
  { id: "tag:doorknockers", name: "doorknockers", count: 88, source: "NATION_BUILDER" },
  { id: "tag:volunteer-2026", name: "volunteer-2026", count: 45, source: "NATION_BUILDER" },
];

/** The API envelope the admin's `request()` unwraps. */
function json(data: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify({ ok: status < 400, data }) };
}

const nbConnection = {
  id: CONNECTION_ID,
  type: "NATION_BUILDER",
  name: "castle-hill",
  group: "castle-hill",
  status: "ACTIVE",
  settings: { baseUrl: "https://castle-hill.nationbuilder.com" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Stub the whole NB surface. `connected: false` starts from the empty state. */
async function stubNationBuilder(
  page: Page,
  opts: {
    connected?: boolean;
    testOk?: boolean;
    lists?: typeof NB_LISTS;
    tags?: typeof NB_TAGS;
    syncJobStates?: Array<{ status: string; syncedCount?: number; failedCount?: number; errorSummary?: string | null }>;
    onSearch?: (url: URL) => void;
    onSync?: (body: Record<string, unknown>) => void;
    onUpsert?: (body: Record<string, unknown>) => void;
  } = {},
) {
  // Connection list flips from empty to connected after a successful upsert.
  let connected = opts.connected ?? true;
  const states = [...(opts.syncJobStates ?? [{ status: "SUCCEEDED", syncedCount: 1204, failedCount: 0 }])];

  await page.route(/\/integrations\/connections\/test$/, (route) =>
    route.fulfill(json({ ok: opts.testOk ?? true, type: "NATION_BUILDER" })),
  );

  await page.route(/\/integrations\/connections$/, (route) => {
    if (route.request().method() === "POST") {
      opts.onUpsert?.(JSON.parse(route.request().postData() || "{}"));
      connected = true;
      return route.fulfill(json({ id: CONNECTION_ID }));
    }
    return route.fulfill(json(connected ? [nbConnection] : []));
  });

  await page.route(/\/integrations\/lists\/search/, (route) => {
    const url = new URL(route.request().url());
    opts.onSearch?.(url);
    const kind = url.searchParams.get("kind");
    return route.fulfill(json({ lists: kind === "tags" ? (opts.tags ?? NB_TAGS) : (opts.lists ?? NB_LISTS) }));
  });

  await page.route(/\/integrations\/lists\/sync$/, (route) => {
    opts.onSync?.(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill(
      json({ syncJobId: SYNC_JOB_ID, audienceId: AUDIENCE_ID, queued: true, status: "QUEUED", type: "NATION_BUILDER" }),
    );
  });

  await page.route(/\/integrations\/sync-jobs/, (route) => {
    const state = states.length > 1 ? states.shift()! : states[0];
    return route.fulfill(
      json([
        {
          id: SYNC_JOB_ID,
          audienceId: AUDIENCE_ID,
          remoteListId: NB_LISTS[0].id,
          createdAt: new Date().toISOString(),
          ...state,
        },
      ]),
    );
  });
}

async function openDataSync(page: Page) {
  await page.goto("/audience/sync", { waitUntil: "domcontentloaded" });
  await expect(page, "no sign-in bounce from /audience/sync").not.toHaveURL(/\/sign-in|\/login/);
}

test.describe("NationBuilder data sync", () => {
  test("first run: connect a nation from the empty state, in place", async ({ page }) => {
    const upserts: Array<Record<string, unknown>> = [];
    await stubNationBuilder(page, { connected: false, onUpsert: (b) => upserts.push(b) });
    await openDataSync(page);

    // Empty state leads with NationBuilder.
    await expect(page.getByText("Connect your NationBuilder nation")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Connect NationBuilder" }).click();

    // Paste a WHOLE control-panel URL — the dialog trims it to the slug.
    await page.getByLabel("Nation address").fill("https://Castle-Hill.nationbuilder.com/admin/settings");
    await page.getByLabel("API token").fill("nb-token-abc");
    await page.getByRole("button", { name: "Connect", exact: true }).click();

    // Saved with the normalised slug as name + group + derived baseUrl.
    await expect
      .poll(() => upserts.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(upserts[0]).toMatchObject({
      type: "NATION_BUILDER",
      name: "castle-hill",
      group: "castle-hill",
      baseUrl: "https://castle-hill.nationbuilder.com",
    });

    // The surface flips to connected: connections card + pull card with the nation's lists.
    await expect(page.locator("#data-sync-connections")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#tour-audience-sync")).toBeVisible();
    await expect(page.getByText("Doorknock volunteers")).toBeVisible({ timeout: 20_000 });
  });

  test("a token that fails the test stores nothing and says why", async ({ page }) => {
    const upserts: Array<Record<string, unknown>> = [];
    await stubNationBuilder(page, { connected: false, testOk: false, onUpsert: (b) => upserts.push(b) });
    await openDataSync(page);

    await page.getByRole("button", { name: "Connect NationBuilder" }).click();
    await page.getByLabel("Nation address").fill("castle-hill");
    await page.getByLabel("API token").fill("revoked-token");
    await page.getByRole("button", { name: "Connect", exact: true }).click();

    await expect(
      page.getByText(/couldn't reach castle-hill\.nationbuilder\.com with that token/i),
    ).toBeVisible({ timeout: 10_000 });
    expect(upserts).toHaveLength(0); // test-then-save: nothing stored on failure
  });

  test("browse by tag, sync it, and land on the success panel with honest counts", async ({ page }) => {
    const searches: URL[] = [];
    const syncs: Array<Record<string, unknown>> = [];
    await stubNationBuilder(page, {
      onSearch: (u) => searches.push(u),
      onSync: (b) => syncs.push(b),
      syncJobStates: [
        { status: "RUNNING", syncedCount: 40 },
        {
          status: "SUCCEEDED",
          syncedCount: 88,
          failedCount: 0,
          errorSummary: JSON.stringify({ skippedNoPhone: 14, skippedInvalidPhone: 2, failedPersist: 0 }),
        },
      ],
    });
    await openDataSync(page);
    await expect(page.locator("#tour-audience-sync")).toBeVisible({ timeout: 20_000 });

    // Flip to Tags — the search re-runs with kind=tags and shows tag rows.
    await page.getByRole("tab", { name: "Tags" }).click();
    await expect(page.getByText("doorknockers", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(searches.some((u) => u.searchParams.get("kind") === "tags")).toBe(true);

    // Pick the tag and sync it — the tag: pseudo-id rides the normal sync payload.
    await page.getByText("doorknockers", { exact: true }).click();
    await page.getByRole("button", { name: "Sync Selected List" }).click();
    await expect.poll(() => syncs.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(syncs[0]).toMatchObject({ type: "NATION_BUILDER", listId: "tag:doorknockers" });

    // The success panel lands with the counts line and the tool CTAs.
    const panel = page.getByTestId("sync-success-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText("Synced 88 people");
    await expect(panel).toContainText("14 email-only (kept, not textable)");
    await expect(panel.getByRole("link", { name: "Send a text blast" })).toHaveAttribute("href", "/channels/text");
    await expect(panel.getByRole("link", { name: "View audience" })).toHaveAttribute(
      "href",
      `/audience/${AUDIENCE_ID}`,
    );
  });
});
