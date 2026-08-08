import { signInScoped, test } from "./fixtures";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Importing an audience from Action Network — the path an organiser walks before every blast,
 * and the one with no e2e cover at all until now.
 *
 * THE HONEST BIT ABOUT STUBS. Half of this spec runs against the real stack; half stubs the
 * `/integrations/*` responses in the browser. That split is deliberate, not laziness: the import
 * needs a live Action Network account and API key, which no CI environment has and no test should
 * ever hold. So:
 *
 *   - What the real server does with no connection configured, and what it does when asked to sync
 *     a source that was never connected, is asserted for real. No stubs.
 *   - The journey itself — pick a source, see its lists, sync one, watch the job land — is driven
 *     against stubbed integration responses, because the alternative is no coverage of the screen
 *     an organiser actually uses. The stubs mimic Action Network's shape (a list carries a
 *     `total_records` count; a sync returns a job id and polls to a terminal state); everything
 *     between the fetch and the pixels is the real app.
 *
 * The failure this exists to catch is the quiet one: a sync that reports nothing and leaves the
 * organiser staring at "Syncing…" while their blast goes out to yesterday's list.
 *
 * Conventions match the rest of this directory: URL defaulting inlined (the Playwright TS loader
 * trips on local `.ts` imports here).
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");

const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

const CONNECTION_ID = "e2e-an-connection";
const AUDIENCE_ID = "e2e-an-audience";
const SYNC_JOB_ID = "e2e-an-job";

/** Two lists, shaped the way the connector maps Action Network's `osdi:lists`. */
const REMOTE_LISTS = [
  { id: "an-list-supporters", name: "Training — interested", count: 62, source: "ACTION_NETWORK" },
  { id: "an-list-ticketed", name: "Training — ticket holders", count: 18, source: "ACTION_NETWORK" },
];

async function signInAsOrganiser(request: APIRequestContext): Promise<string> {
  // Pinned to THIS worker's tenant — see signInScoped. A bare sign-in resolves an arbitrary
  // membership once the demo users belong to every worker's tenant, and the fixtures this spec
  // creates would then land somewhere its own assertions cannot see.
  return (await signInScoped(request, ORGANISER)).token;
}

/** The API envelope the admin's `request()` unwraps. */
function json(data: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify({ ok: status < 400, data }) };
}

/**
 * Stub the integration surface for one page.
 *
 * `syncJobStates` is walked one entry per `GET /integrations/sync-jobs` poll, so a test can make
 * the job run and then land (or fail) exactly as the real one would over several seconds.
 */
async function stubIntegrations(
  page: Page,
  opts: {
    lists?: typeof REMOTE_LISTS;
    syncJobStates?: Array<{ status: string; syncedCount?: number; failedCount?: number; errorSummary?: string | null }>;
    onSearch?: (url: URL) => void;
    onSync?: (body: Record<string, unknown>) => void;
  } = {},
) {
  const lists = opts.lists ?? REMOTE_LISTS;
  const states = [...(opts.syncJobStates ?? [{ status: "COMPLETED", syncedCount: 62, failedCount: 0 }])];

  await page.route(/\/integrations\/connections(\?|$)/, (route) =>
    route.fulfill(
      json([
        {
          id: CONNECTION_ID,
          type: "ACTION_NETWORK",
          name: "Action Network",
          status: "ACTIVE",
          settings: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    ),
  );

  await page.route(/\/integrations\/lists\/search/, (route) => {
    opts.onSearch?.(new URL(route.request().url()));
    return route.fulfill(json({ lists }));
  });

  await page.route(/\/integrations\/lists\/sync$/, (route) => {
    opts.onSync?.(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill(
      json({
        syncJobId: SYNC_JOB_ID,
        audienceId: AUDIENCE_ID,
        queued: true,
        status: "QUEUED",
        type: "ACTION_NETWORK",
      }),
    );
  });

  await page.route(/\/integrations\/sync-jobs/, (route) => {
    // Hold on the last state once the script runs out — a poll that 404s after the script ends
    // would fail the test for a reason the app never causes.
    const state = states.length > 1 ? states.shift()! : states[0];
    return route.fulfill(
      json([
        {
          id: SYNC_JOB_ID,
          audienceId: AUDIENCE_ID,
          remoteListId: REMOTE_LISTS[0].id,
          createdAt: new Date().toISOString(),
          ...state,
        },
      ]),
    );
  });
}

async function openAudiencePage(page: Page) {
  // Data sync is its own route now (graduated from /audience?tab=sync).
  await page.goto("/audience/sync", { waitUntil: "domcontentloaded" });
  await expect(page, "no sign-in bounce from /audience/sync").not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("#tour-audience-sync")).toBeVisible({ timeout: 20_000 });
}

test.describe("Action Network import", () => {
  test("the legacy /audience?tab=sync URL redirects to the Data sync route", async ({ page }) => {
    await page.goto("/audience?tab=sync", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/audience\/sync$/, { timeout: 20_000 });
    await expect(page.locator("#tour-audience-sync")).toBeVisible({ timeout: 20_000 });
  });

  test("with nothing connected, the import card says so and points at Integrations", async ({ page }) => {
    // No stubs: this is the true state of a tenant that has never connected a source, and the
    // failure it guards against is an empty picker that reads as "broken" rather than "not set up".
    await openAudiencePage(page);
    const card = page.locator("#tour-audience-sync");
    const empty = card.getByText(/no import source connected/i);

    if (!(await empty.isVisible().catch(() => false))) {
      test.skip(true, "this tenant already has an import source connected");
    }
    await expect(empty).toBeVisible();
    await expect(card.getByRole("link", { name: /go to integrations/i })).toBeVisible();
    // Nothing to sync, so the action must not invite a click.
    await expect(card.getByRole("button", { name: /sync selected list/i })).toBeDisabled();
  });

  test("the API refuses a sync for a source this tenant never connected", async ({ request }) => {
    // Server truth, no browser: the sync endpoint must not accept an arbitrary connection id.
    // If it did, one tenant could pull another's list through their own audience.
    const token = await signInAsOrganiser(request);
    const res = await request.post(`${API}/integrations/lists/sync`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        type: "ACTION_NETWORK",
        listId: "an-list-does-not-exist",
        audienceName: `E2E AN ${Date.now()}`,
        connectionId: "connection-that-does-not-exist",
      },
    });
    expect(
      res.ok(),
      `syncing through an unknown connection returned ${res.status()} — it must be refused`,
    ).toBeFalsy();
  });

  test("an organiser picks a source, sees its lists with counts, and syncs one", async ({ page }) => {
    const searches: URL[] = [];
    const syncs: Record<string, unknown>[] = [];
    await stubIntegrations(page, {
      onSearch: (url) => searches.push(url),
      onSync: (body) => syncs.push(body),
      syncJobStates: [
        { status: "RUNNING", syncedCount: 0 },
        // SUCCEEDED, not "COMPLETED": the poller's terminal states are SUCCEEDED/FAILED —
        // anything else keeps it polling forever and the success panel never lands.
        { status: "SUCCEEDED", syncedCount: 62, failedCount: 0 },
      ],
    });
    await openAudiencePage(page);

    const card = page.locator("#tour-audience-sync");
    const sync = card.getByRole("button", { name: /sync selected list/i });

    // Source first: the picker drives everything below it, and until one is chosen there is
    // nothing to sync.
    await expect(sync).toBeDisabled();
    await card.getByRole("combobox").click();
    await page.getByRole("option", { name: /action network/i }).click();

    // The lists, with their sizes. A list you cannot size is a send you cannot estimate.
    const supporters = card.getByRole("button", { name: /training — interested/i });
    await expect(supporters).toBeVisible({ timeout: 20_000 });
    await expect(supporters).toContainText("62 contacts");
    await expect(card.getByRole("button", { name: /training — ticket holders/i })).toContainText(
      "18 contacts",
    );

    // The search must be scoped to the chosen connection, or a tenant with two Action Network
    // accounts silently browses the wrong one.
    expect(searches.length, "no list search was issued").toBeGreaterThan(0);
    const last = searches[searches.length - 1];
    expect(last.searchParams.get("type")).toBe("ACTION_NETWORK");
    expect(last.searchParams.get("connectionId")).toBe(CONNECTION_ID);

    // Still nothing selected → still nothing to sync.
    await expect(sync).toBeDisabled();
    await supporters.click();
    await expect(sync).toBeEnabled();
    await sync.click();

    // What the app asked for is what the organiser picked — the list id, and a name that carries
    // the provider so the audience is identifiable next to a CSV import of the same people.
    await expect.poll(() => syncs.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(syncs[0]).toMatchObject({
      type: "ACTION_NETWORK",
      listId: REMOTE_LISTS[0].id,
      connectionId: CONNECTION_ID,
    });
    expect(String(syncs[0].audienceName)).toMatch(/action network: training — interested/i);

    // And the organiser is told it is happening, then lands on the success panel once the
    // job goes terminal. (The audiences TABLE lives on /audience now, and it refetches from
    // the REAL API which knows nothing of this stub — the table row belongs to a test with a
    // real connection behind it.)
    await expect(card).toContainText(/sync queued/i, { timeout: 20_000 });
    const panel = page.getByTestId("sync-success-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText("Synced 62 people");
    await expect(panel.getByRole("link", { name: "View audience" })).toHaveAttribute(
      "href",
      `/audience/${AUDIENCE_ID}`,
    );
  });

  test("a failed sync says why instead of spinning forever", async ({ page }) => {
    await stubIntegrations(page, {
      syncJobStates: [
        { status: "RUNNING", syncedCount: 0 },
        { status: "FAILED", syncedCount: 0, failedCount: 62, errorSummary: "Action Network API key rejected (401)" },
      ],
    });
    await openAudiencePage(page);

    const card = page.locator("#tour-audience-sync");
    await card.getByRole("combobox").click();
    await page.getByRole("option", { name: /action network/i }).click();
    await card.getByRole("button", { name: /training — interested/i }).click();
    await card.getByRole("button", { name: /sync selected list/i }).click();

    // The whole point: a rejected key must surface, not sit behind a spinner. An organiser who
    // does not learn the import failed will blast the previous version of the list.
    await expect(card, "a failed sync left no message at all").toContainText(/sync failed/i, {
      timeout: 30_000,
    });
    await expect(card).toContainText(/401|rejected|key/i);
    // The button has to come back, or the only way to retry is a page reload.
    await expect(card.getByRole("button", { name: /sync selected list/i })).toBeEnabled({
      timeout: 20_000,
    });
  });
});
