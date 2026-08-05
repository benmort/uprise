import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e against the live stack. `globalSetup` seeds demo data, mints a real
 * session cookie and resolves the seeded IDs.
 *
 *   npm --prefix apps/admin run e2e                 (localhost; Playwright boots the apps)
 *   E2E_TARGET=ngrok npm --prefix apps/admin run e2e  (the *.dev.uprise.org.au tunnel)
 *
 * Localhost prereqs: Postgres + Redis up; apps/api/.env with BASIC_AUTH_*. In ngrok
 * mode the apps must already be running behind the tunnel (`pnpm dev:all`), so
 * Playwright manages no servers — it exercises the real cross-subdomain SSO cookie.
 *
 * The target is resolved inline (not a shared import): Playwright's TS config loader
 * trips on a local `.ts` import here under Node 23, so global-setup + auth.spec keep
 * their own copies of this short defaulting.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const WEB = process.env.WEB_URL || (IS_NGROK ? "https://admin.dev.uprise.org.au" : "http://localhost:3000");
const AUTH_APP_URL =
  process.env.NEXT_PUBLIC_AUTH_APP_URL || (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");
const MARKETING_URL = process.env.MARKETING_URL || (IS_NGROK ? "https://dev.uprise.org.au" : "http://localhost:3003");
// The canvasser PWA (apps/field) runs on :3005 locally; field-PWA specs navigate to it absolutely
// and use the volunteer storageState (e2e/.auth/volunteer.json, minted by global-setup).
const FIELD_URL = process.env.FIELD_URL || (IS_NGROK ? "https://field.dev.uprise.org.au" : "http://localhost:3005");
const API_HEALTH = API_BASE + "/health";
// The one spec that needs a real service worker, and so belongs to exactly one project.
const PWA_ONLY = /service-worker\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // shared seeded DB — keep it serial to avoid cross-test contention
  // One retry everywhere, not just CI. The admin app's next-pwa service worker can replay a
  // cached sign-in redirect into a fresh context before sw-cleanup.tsx evicts it (the poisoned
  // start-url cache documented in auth.spec), which bounces an authed navigation to the auth
  // app at random — server-side the same routes return 200 every time. A retry keeps that from
  // failing the suite while STILL reporting it: Playwright counts a pass-on-retry as "flaky",
  // so the noise stays visible rather than being swallowed.
  retries: 1,
  // The html report is what CI uploads (the workflow already collects apps/admin/playwright-report,
  // which collected nothing while `list` was the only reporter). `open: "never"` keeps it from
  // launching a browser on a developer's machine at the end of a run.
  reporter: [["list"], ["html", { open: "never" }]],
  // An engine that cannot launch fails fast instead of burning the whole job.
  maxFailures: process.env.CI ? 20 : undefined,
  use: {
    baseURL: WEB,
    // Cookie session minted by global-setup (meld doc 14); the unauth spec overrides this.
    storageState: "./e2e/.auth/state.json",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // NOTE: no `channel` here. A root-level channel merges into EVERY project, so a firefox or
    // webkit project would try to launch branded Chrome and die. Engine selection belongs in
    // `projects` below – this was the single thing blocking cross-browser coverage.
  },
  // Three engines, because a Chromium-only suite cannot see an engine-specific failure: an
  // invite acceptance that works in Chrome silently posted nothing in Firefox, and no test could
  // have caught it. Run one engine locally (`pnpm --filter admin e2e` defaults to chromium) and
  // the matrix in CI.
  projects: [
    { name: "chromium", testIgnore: PWA_ONLY, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "firefox", testIgnore: PWA_ONLY, use: { ...devices["Desktop Firefox"] } },
    // Desktop Safari is a 2x-DPR descriptor; pinning to 1 keeps traces the same weight as the
    // other engines'.
    { name: "webkit", testIgnore: PWA_ONLY, use: { ...devices["Desktop Safari"], deviceScaleFactor: 1 } },
    /**
     * The PWA lane – service-worker.spec.ts and nothing else, which is why the three engines above
     * ignore that file: it would otherwise run in lanes where its premise is false.
     *
     * It only means something against a PRODUCTION build. next.config.mjs disables next-pwa
     * whenever NODE_ENV is development unless ENABLE_PWA=true, and every lane here runs `next dev`,
     * so the service worker is absent from the whole default suite. Run it deliberately:
     *
     *   NEXT_DIST_DIR=.next-pwa pnpm --filter admin build
     *   NEXT_DIST_DIR=.next-pwa pnpm --filter admin start   # then, in another shell:
     *   pnpm --filter admin e2e:pwa
     *
     * Against `next dev` it proves nothing, and the spec's first test fails saying exactly that.
     * Deliberately NOT part of the default `e2e` script.
     */
    {
      name: "chromium-pwa",
      testMatch: PWA_ONLY,
      use: { ...devices["Desktop Chrome"], channel: "chrome", serviceWorkers: "allow" },
    },
  ],
  // In ngrok mode the apps are already up behind the tunnel (`pnpm dev:all`), so
  // Playwright manages no servers; locally it boots the four apps if not running.
  webServer: IS_NGROK
    ? undefined
    : [
        {
          command: "npm --prefix ../api run dev",
          url: API_HEALTH,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "npm run dev",
          // /login was removed in the doc-14 cutover; the root 307-redirects when
          // unauthenticated, which Playwright accepts as "ready".
          url: WEB,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "npm --prefix ../auth run dev",
          url: `${AUTH_APP_URL}/sign-in`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "npm --prefix ../product-marketing run dev",
          url: MARKETING_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          // The canvasser PWA. Its root 307-redirects when unauthenticated (SSO gate), which
          // Playwright accepts as "ready".
          command: "npm --prefix ../field run dev",
          url: FIELD_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
