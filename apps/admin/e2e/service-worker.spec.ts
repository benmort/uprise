import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The next-pwa service worker – the one production surface with no e2e cover at all.
 *
 * BE HONEST ABOUT WHAT THIS LANE IS. `next.config.mjs` disables next-pwa whenever
 * `NODE_ENV === "development"` unless `ENABLE_PWA=true`, and every other lane in this suite runs
 * `next dev`. So the documented bug – next-pwa's dynamicStartUrl caching the app root's
 * cross-origin auth redirect as a 200 and replaying it forever, an inescapable SSO loop – has
 * never once been exercised by a test. `auth.spec.ts` has a test named "…even with the service
 * worker active"; in every lane that runs it, there is no service worker. Its premise is false.
 *
 * Running THIS file against `next dev` proves nothing either. It needs a production build:
 *
 *   NEXT_DIST_DIR=.next-pwa pnpm --filter admin build
 *   NEXT_DIST_DIR=.next-pwa pnpm --filter admin start        # then, in another shell:
 *   pnpm --filter admin e2e:pwa
 *
 * (`NEXT_DIST_DIR` keeps the build off the `.next` a running `next dev` is serving from – see
 * CLAUDE.md. It does not isolate everything: next-pwa writes `sw.js` into `public/`, which a dev
 * server will happily serve afterwards, so delete `apps/admin/public/sw.js` when you are done.)
 *
 * Hence the two guards below. Against a dev server the whole file skips with a reason (a bare
 * `npx playwright test` with no --project WOULD otherwise run this lane against `next dev`, where
 * its premise is false). Against a production build that registers no worker, the precondition
 * test fails loudly, instead of three tests passing vacuously.
 *
 * The `chromium-pwa` project in playwright.config.ts is scoped to this file only, and is not part
 * of the default `e2e` script.
 */

/**
 * Settle the page onto a controlling service worker, and report whether one is in play.
 *
 * The reload is not incidental. `sw-cleanup.tsx` runs a one-shot eviction on module evaluation –
 * it unregisters every worker and deletes the poisoned caches – so on the first load of a fresh
 * browser profile the worker that just registered is torn straight back down. The flag it writes
 * makes the second load the first one where a worker can survive.
 */
async function settleWorker(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  await page.reload();
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (navigator.serviceWorker.controller) return true;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        // Registered but not yet claiming this client; a navigation hands it control.
        await new Promise((r) => setTimeout(r, 500));
        if (navigator.serviceWorker.controller) return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  });
}

/** Is a worker controlling the current document right now? */
function isControlling(page: Page): Promise<boolean> {
  return page.evaluate(
    () => "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller),
  );
}

const PWA_LANE_HINT =
  "no service worker registered – this lane needs a PRODUCTION build (see the header comment); against `next dev` it proves nothing";

const DEV_SERVER_HINT =
  "the admin app under test is `next dev`, where next-pwa is disabled – this whole lane is meaningless against it. Build and start it first (see the header comment).";

/**
 * Is the app under test a dev server? `next dev` serves its manifests from the literal
 * `/_next/static/development/` path; a production build serves them from `/_next/static/<buildId>/`
 * and 404s here.
 *
 * This exists because the `chromium-pwa` project is excluded from the NAMED e2e scripts but not
 * from a bare `npx playwright test`, which would run this file against whatever is on :3000 –
 * normally `next dev`. Skipping with a reason beats three confusing failures. Probing for a live
 * worker is NOT a substitute: `public/sw.js` is left behind by any previous production build and a
 * dev server will happily serve it, so its presence proves nothing either way.
 */
async function servedByNextDev(request: APIRequestContext): Promise<boolean> {
  const res = await request
    .get("/_next/static/development/_buildManifest.js", { failOnStatusCode: false })
    .catch(() => null);
  return Boolean(res?.ok());
}

test.beforeEach(async ({ request }) => {
  test.skip(await servedByNextDev(request), DEV_SERVER_HINT);
});

test("the lane has a live service worker at all (precondition)", async ({ page }) => {
  // Not skipped: past the dev-server guard above, a production build that registers no worker is
  // a real fault, and this is the test that says so.
  const active = await settleWorker(page);
  expect(active, PWA_LANE_HINT).toBeTruthy();
});

test("an authed root navigation resolves to /dashboard and stays there across reloads", async ({
  page,
}) => {
  const active = await settleWorker(page);
  test.skip(!active, PWA_LANE_HINT);

  const first = await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);
  expect(first?.fromServiceWorker(), "the app root must always hit the network").toBeFalsy();

  // The poisoned start-url cache did not bite on the load that filled it – it bit on the next one.
  const reloaded = await page.reload();
  await expect(page, "a cached redirect replayed here is the SSO loop").toHaveURL(/\/dashboard/);
  expect(reloaded?.fromServiceWorker(), "the reload was answered from the worker's cache").toBeFalsy();

  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);

  // Without this the three assertions above could all pass on a page no worker ever controlled.
  expect(
    await isControlling(page),
    "no worker was controlling by the end – the assertions above proved nothing",
  ).toBeTruthy();
});

test("no navigation document is served from, or held in, the worker's cache", async ({ page }) => {
  const active = await settleWorker(page);
  test.skip(!active, PWA_LANE_HINT);

  const res = await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  expect(res?.fromServiceWorker(), "a page document came back from the service worker").toBeFalsy();

  /**
   * next-pwa's own document caches. `start-url` is the one that replayed the auth redirect;
   * `others` is its catch-all, which an explicit `runtimeCaching` array replaces. Both are off in
   * next.config.mjs, so either reappearing means the guard was dropped.
   *
   * `canvass-api` is deliberately NOT asserted absent – it is a legitimate data cache now that its
   * matcher excludes navigations. Whether a document got into it is the next assertion's job.
   */
  const cacheNames: string[] = await page.evaluate(() =>
    "caches" in window ? caches.keys() : ([] as string[]),
  );
  expect(
    cacheNames.filter((n) => ["start-url", "others"].includes(n)),
    "a cache that only ever held navigation documents is back",
  ).toEqual([]);

  // …and nothing anywhere is an HTML document. Only extensionless URLs are opened: a navigation
  // path has no file extension, and probing every entry would walk thousands of map tiles.
  const cachedDocuments: string[] = await page.evaluate(async () => {
    if (!("caches" in window)) return [];
    const found: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) {
        const last = new URL(req.url).pathname.split("/").pop() ?? "";
        if (last.includes(".")) continue;
        const cached = await cache.match(req);
        if ((cached?.headers.get("content-type") ?? "").includes("text/html")) {
          found.push(`${key}: ${req.url}`);
        }
      }
    }
    return found;
  });
  expect(cachedDocuments, "a page document is sitting in a cache waiting to be replayed").toEqual([]);
});
