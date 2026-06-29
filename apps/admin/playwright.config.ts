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
const API_HEALTH = API_BASE + "/health";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // shared seeded DB — keep it serial to avoid cross-test contention
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB,
    // Cookie session minted by global-setup (meld doc 14); the unauth spec overrides this.
    storageState: "./e2e/.auth/state.json",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    channel: "chrome",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
          command: "npm --prefix ../marketing run dev",
          url: MARKETING_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
