import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Invitation acceptance under hostile client conditions – one test per hypothesis left standing
 * after two production incidents (an owner whose session was minted and then never used again,
 * and a Firefox invitee whose accept POST never left the browser).
 *
 * `invite-journey.spec.ts` proves the happy path works in all three engines. This file proves the
 * app SAYS something useful when it doesn't, because every hypothesis here shares one shape: the
 * server is fine, the browser is not, and the invitee sees nothing that tells them so.
 *
 * The four conditions, each reproduced at the network layer rather than guessed at:
 *   1. the accept POST is blocked client-side (extension, filter, corporate proxy);
 *   2. the accept succeeds but the session cookie never sticks (privacy mode, cookie policy);
 *   3. the password is too short (the confirmed root cause of one incident – native HTML5
 *      validation silently blocked the submit, so there was no message AND no request);
 *   4. the JS bundle never executes.
 *
 * 1 and 3 assert copy that has shipped – the "We couldn't reach the server" alert and the inline
 * "Password must be at least 8 characters." error, both on the invite page. 2 and 4 are KNOWN
 * GAPS with no owner: nothing in the product says anything to a dropped session or a dead bundle,
 * so each declares `test.fail()` at the exact assertion that is missing its product change, and
 * everything up to that point stays a hard assertion. See auth.spec.ts for the same idiom.
 *
 * Cookie-stripping is done at the route rather than by simulating a third-party-cookie policy:
 * neither target can reproduce that. Locally :3000 → :3001 is the same host (cookies ignore port),
 * and the ngrok stack is same-SITE. Removing the session at the route is the only mechanism that
 * reproduces "the cookie never stuck" in every engine – see the test itself for why deleting the
 * Set-Cookie header is NOT enough on its own.
 *
 * The URL defaulting is inlined rather than imported: every spec here does the same, because
 * Playwright's TS config loader has tripped on local `.ts` imports in this directory.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");
const AUTH_APP =
  process.env.NEXT_PUBLIC_AUTH_APP_URL ||
  (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");

const OWNER = { email: "demo.owner@uprise.test", password: "demo-owner-pw" };

/**
 * A cold browser, exactly like a real invitee – plus `serviceWorkers: "block"`, which is load
 * bearing here and nowhere else in the suite: `page.route` does NOT intercept requests a service
 * worker issues, so an admin build with the worker active would sail straight past every
 * interception below and the tests would pass for the wrong reason.
 */
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });

/**
 * The message the invitee must see when the request never reached the server. Deliberately a
 * family of phrasings rather than one sentence – the wording can be tuned without breaking this –
 * but no raw browser string can satisfy it, which is the whole point.
 */
const UNREACHABLE_COPY =
  /(couldn'?t|could not|unable to|didn'?t|did not)\s+(reach|contact|connect to|talk to)|(never|didn'?t) (reach|leave)|check your (internet |network )?connection|you (appear to be |seem to be )?offline/i;

/** What the browser itself says. If this is on screen, the app has not handled the failure. */
const RAW_BROWSER_ERROR =
  /failed to fetch|networkerror when attempting to fetch|load failed|net::err_|typeerror/i;

/** The refusal a genuinely spent/revoked token produces – a blocked request is NOT that. */
const SPENT_TOKEN_COPY = /invalid or expired invitation/i;

/**
 * The explanation owed to someone whose accept succeeded but whose session cookie was dropped.
 * Landing on the sign-in page is an acceptable destination; landing there mute is not.
 */
const COOKIE_LOST_COPY =
  /(couldn'?t|could not|unable to)\s+(keep you signed in|sign you in|start your session|save your session|store your session)|(session|sign-?in) cookie|cookies? (are |were |is )?(blocked|disabled|not enabled)|enable cookies|third-?party cookies/i;

/** A password the app refuses must say so. The always-visible hint ("At least 8 characters
 *  (skip if you already have an account)") must NOT be able to satisfy this – Field swaps the
 *  hint out for the error, and matching the hint is exactly how a test passes for the wrong
 *  reason. Every alternative below needs a word the hint does not contain. */
const SHORT_PASSWORD_COPY =
  /too short|password (must|needs to|has to|should) be at least|use at least 8 characters|minimum of 8 characters/i;

/** The escape hatch owed to a page whose bundle never runs: a timeout, a retry, or an instruction. */
const STUCK_LOADING_ESCAPE_COPY =
  /taking longer than|trouble loading|couldn'?t load|didn'?t load|still loading|enable javascript|javascript is (required|disabled)|refresh (this |the )?page|reload (this |the )?page|try again/i;

/** Console + failed-request evidence, attached on failure – production could give us neither. */
type Diagnostics = { console: string[]; failed: string[] };
const diagnostics = new WeakMap<Page, Diagnostics>();

function armDiagnostics(page: Page): Diagnostics {
  const log: Diagnostics = { console: [], failed: [] };
  diagnostics.set(page, log);
  page.on("console", (m) => m.type() === "error" && log.console.push(m.text()));
  page.on("pageerror", (e) => log.console.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => log.failed.push(`${r.method()} ${r.url()} – ${r.failure()?.errorText}`));
  return log;
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const log = diagnostics.get(page);
  if (!log) return;
  await testInfo.attach("console-errors", {
    body: log.console.join("\n") || "(none)",
    contentType: "text/plain",
  });
  await testInfo.attach("failed-requests", {
    body: log.failed.join("\n") || "(none)",
    contentType: "text/plain",
  });
});

/** Mint an opaque session token + resolve the tenant, over the API (no UI login needed). */
async function signInAsOwner(request: APIRequestContext) {
  const res = await request.post(`${API}/iam/sessions`, { data: OWNER });
  expect(res.ok(), "seeded owner should be able to sign in").toBeTruthy();
  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  const memberships = json?.data?.memberships ?? json?.memberships ?? [];
  expect(token, "owner sign-in should return a session token").toBeTruthy();
  return { token, tenantId: memberships[0]?.tenantId as string };
}

/**
 * Issue a real invitation and return its token. `POST /tenants/:id/invitations` returns the token
 * to the issuer, so no mailbox and no database access is needed. Created per-test, never in
 * `beforeAll`: accept is single-use and `retries: 1` is on. The `e2e.invite.` prefix is what
 * `pnpm --filter api clear:test-residue` sweeps.
 */
async function createInvite(
  request: APIRequestContext,
  auth: { token: string; tenantId: string },
  role: "OWNER" | "ORGANISER" | "VOLUNTEER" = "ORGANISER",
) {
  const email = `e2e.invite.hostile.${role.toLowerCase()}.${Date.now()}@uprise.test`;
  const res = await request.post(`${API}/tenants/${auth.tenantId}/invitations`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { email, role },
  });
  expect(res.ok(), `invitation create should succeed (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const inviteToken: string = json?.data?.token ?? json?.token;
  expect(inviteToken, "create should return the invite token").toBeTruthy();
  return { email, inviteToken };
}

async function openInvite(page: Page, inviteToken: string) {
  // No return_to, exactly like the emailed link.
  await page.goto(`${AUTH_APP}/invite/${inviteToken}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/You're invited to join/i)).toBeVisible();
}

async function fillAndSubmit(page: Page, password: string) {
  await page.locator("#firstName").fill("E2E");
  await page.locator("#lastName").fill("Hostile");
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /accept invitation/i }).click();
}

/** Hypothesis 1 – the accept POST never reaches the server. */
test("a client-blocked accept POST says the request never reached the server", async ({ page, request }) => {
  const auth = await signInAsOwner(request);
  const { inviteToken } = await createInvite(request, auth);
  armDiagnostics(page);

  // Only the POST: the preview GET (`/iam/invite/<token>`) must still succeed, or the page would
  // render the load-error state and we would be testing the wrong thing entirely.
  await page.route(
    (url) => url.pathname.endsWith("/iam/invite/accept"),
    (route) =>
      route.request().method() === "POST" ? route.abort("blockedbyclient") : route.continue(),
  );

  await openInvite(page, inviteToken);

  const attempted = page.waitForRequest(
    (r) => r.url().includes("/iam/invite/accept") && r.method() === "POST",
    { timeout: 30_000 },
  );
  await fillAndSubmit(page, "e2e-invite-pw-123");
  expect(
    await attempted.catch(() => null),
    "the browser never even attempted the accept POST – the block is not what failed",
  ).not.toBeNull();

  const body = page.locator("body");
  await expect(
    body,
    "a request the browser refused to send must produce actionable copy, not a raw fetch error",
  ).toContainText(UNREACHABLE_COPY, { timeout: 20_000 });
  // The two ways this assertion has been passed for the wrong reason before.
  await expect(body).not.toContainText(RAW_BROWSER_ERROR);
  await expect(body, "a blocked request is not a spent token – do not conflate them").not.toContainText(
    SPENT_TOKEN_COPY,
  );
});

/** Hypothesis 2 – the accept succeeds, the session cookie does not stick. */
test("an accept whose session cookie is dropped does not strand the invitee on a mute sign-in", async ({
  page,
  request,
}) => {
  const auth = await signInAsOwner(request);
  const { email, inviteToken } = await createInvite(request, auth);
  armDiagnostics(page);

  const context = page.context();
  let newUserId: string | undefined;
  /** The jar as it stood at the instant the page was handed the accept response. */
  let jarAtFulfil: string[] | undefined;
  await page.route(
    (url) => url.pathname.endsWith("/iam/invite/accept"),
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        // The grant shape is `{ token, user: { id, memberships }, memberships }` under the
        // envelope's `data` – there is no top-level `userId`, which is how the seat cleanup
        // came to silently target `undefined`.
        newUserId = json?.data?.user?.id ?? json?.user?.id;
      } catch {
        /* the seat cleanup below asserts we got an id, so a parse failure surfaces there */
      }
      // The whole mechanism: a perfect 200 the browser cannot turn into a session. Playwright
      // lowercases header keys, so one delete removes the joined Set-Cookie.
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      // …and deleting the header is NOT sufficient. `route.fetch()` runs through the browser
      // context's own APIRequestContext, which parses Set-Cookie and writes it into the SHARED
      // cookie jar before the headers are ever handed to us – so the session sticks anyway and
      // the test proves nothing. Evict it here, while the page's fetch() is still pending and no
      // application code has seen the response, so the browser genuinely has no session next.
      await context.clearCookies({ name: "auth_token" });
      jarAtFulfil = (await context.cookies()).map((c) => c.name);
      await route.fulfill({ response, headers, body: text });
    },
  );

  await openInvite(page, inviteToken);
  const accepted = page.waitForResponse(
    (r) => r.url().includes("/iam/invite/accept") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await fillAndSubmit(page, "e2e-invite-pw-123");
  const res = await accepted;
  expect(res.status(), "the server side of this hypothesis must succeed").toBeLessThan(300);

  // The precondition, proven rather than assumed. Without this the test can silently degrade into
  // "an accept that worked perfectly", which is what a header-only strip actually produced.
  expect(
    jarAtFulfil,
    "the route handler never ran – nothing was stripped and this test is not testing anything",
  ).toBeDefined();
  expect(
    jarAtFulfil,
    "auth_token was in the jar when the page got its response – the session was NOT dropped",
  ).not.toContain("auth_token");
  expect(
    (await context.cookies()).map((c) => c.name),
    "auth_token came back after the accept – the invitee is signed in and the premise is gone",
  ).not.toContain("auth_token");

  // Give the seat back BEFORE the assertions below, not after: the accept consumed one the moment
  // it returned 200, and this test is expected to fail until the missing copy lands. Cleaning up
  // after a failing assertion would never run, and the demo tenant's 10 seats would drain into
  // PLAN_LIMIT errors that read like a product bug. The browser has no session either way, so
  // removing the membership cannot change what it does next.
  expect(newUserId, "accept response should carry the new user id").toBeTruthy();
  const removed = await request.delete(`${API}/tenants/${auth.tenantId}/members/${newUserId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(removed.ok(), `seat cleanup failed (${removed.status()}) for ${email}`).toBeTruthy();

  // completeAuth() navigates to the admin app; with no cookie the middleware bounces straight back
  // to the auth app's sign-in. Landing there is fine – landing there with nothing on screen to
  // explain why an accepted invitation did not sign them in is the failure.
  await page.waitForURL(/\/sign-in|\/dashboard|\/getting-started/, { timeout: 45_000 });

  /**
   * KNOWN GAP, no owner in this batch – nothing in apps/auth or apps/admin says anything about a
   * dropped session (nothing matching "keep you signed in", "cookies are blocked", "enable
   * cookies" exists in either app). The product change owed is a sign-in surface that explains why
   * an accepted invitation did not sign you in.
   *
   * test.fail() is declared HERE rather than at the top of the test on purpose: everything above –
   * the accept succeeding, the strip actually stripping, the empty jar – stays a hard assertion
   * that fails loudly, and only the one missing sentence is an expected failure. Same idiom as
   * auth.spec.ts: the test still runs and is reported, and the suite turns red the moment the copy
   * lands. Delete this line then.
   */
  test.fail();
  await expect(
    page.locator("body"),
    "accepted, then silently signed out – the invitee is owed an explanation, not a login form",
    // Short, because this is waiting for something known to be absent: it is the run's cost, not
    // a real settling window (the page has already navigated by the time we get here).
  ).toContainText(COOKIE_LOST_COPY, { timeout: 10_000 });
});

/** Hypothesis 3 – the confirmed root cause: a short password, no message, no request. */
test("a too-short password is refused out loud, not silently", async ({ page, request }) => {
  const auth = await signInAsOwner(request);
  const { inviteToken } = await createInvite(request, auth);
  armDiagnostics(page);

  const posted: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/iam/invite/accept") && r.method() === "POST") posted.push(r.url());
  });

  await openInvite(page, inviteToken);
  await fillAndSubmit(page, "abc1");

  // A deliberate quiet window: the assertion is that NOTHING happens on the wire, and the only way
  // to observe an absence is to wait out the interval in which it would have appeared.
  await page.waitForTimeout(2_000);
  expect(posted, "a password the app rejects must never be sent to the server").toEqual([]);

  // The hint is always on screen, so it must not be able to satisfy this (see SHORT_PASSWORD_COPY).
  await expect(
    page.locator("form"),
    "native HTML5 validation blocks the submit with no message – the app must say why",
  ).toContainText(SHORT_PASSWORD_COPY, { timeout: 10_000 });
});

/** Hypothesis 4 – the bundle never executes. */
test("a bundle that never executes does not strand the invitee on 'Loading invitation…'", async ({
  page,
  request,
}) => {
  const auth = await signInAsOwner(request);
  const { inviteToken } = await createInvite(request, auth);
  armDiagnostics(page);

  // Block the app's own chunks only. The server-rendered shell still arrives, so what is left on
  // screen is exactly what a client with a broken/blocked bundle sees.
  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort("blockedbyclient"));

  // `load` may never settle with aborted subresources; domcontentloaded is what we can rely on.
  await page.goto(`${AUTH_APP}/invite/${inviteToken}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText(/Loading invitation/i),
    "without this the test is not reproducing a dead bundle at all",
  ).toBeVisible();

  /**
   * KNOWN GAP, no owner in this batch – the invite page renders a bare `Loading invitation…` with
   * no timer behind it (apps/auth/src/app/(sso)/invite/[token]/page.tsx: the preview effect has no
   * deadline and there is no fallback state), so a client whose bundle never runs sits on that
   * line forever. The product change owed is a timeout on the loading state with an escape hatch –
   * reload, retry, or an instruction.
   *
   * Declared here, after the reproduction is confirmed above, so a failure to even reach the
   * loading state still fails loudly. Delete this line once the timeout lands.
   */
  test.fail();
  await expect(
    page.locator("body"),
    "a spinner with no timeout and no escape hatch is indistinguishable from a hung tab",
    // Short for the same reason as above: this is waiting out something known to be absent.
  ).toContainText(STUCK_LOADING_ESCAPE_COPY, { timeout: 10_000 });
});
