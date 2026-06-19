import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e against the live local stack. `globalSetup` seeds demo data + resolves
 * the seeded IDs; the auth fixture injects the super-admin Basic-auth creds into
 * sessionStorage (same pattern as scripts/capture-surfaces.mjs). webServer boots the
 * API (:3001) + web (:3000) if they aren't already running.
 *   npm --prefix apps/web run e2e            (headless)
 *   npm --prefix apps/web run e2e:ui         (interactive)
 * Prereqs: local Postgres + Redis up; apps/api/.env with BASIC_AUTH_*.
 */
const WEB = process.env.WEB_URL || "http://localhost:3000";
const API_HEALTH = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1") + "/health";

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
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    channel: "chrome",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm --prefix ../api run dev",
      url: API_HEALTH,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: `${WEB}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
