import { test, expect } from "@playwright/test";

/**
 * Auth e2e against the doc-14 cookie/SSO model. The global storageState (set in
 * global-setup) carries the httpOnly auth_token cookie, so authed specs need no
 * client-side injection. The web app has no /login of its own anymore — an
 * unauthenticated request is 307-redirected to the standalone auth app.
 *
 * Regression cover for the SSO redirect loop:
 *  - unauth root + dashboard 307 to the auth app (the middleware gate works);
 *  - an authed user reaches the dashboard from the root and STILL does after the
 *    service worker is active — the poisoned next-pwa start-url cache used to replay
 *    the redirect "from service worker" (see apps/admin/src/components/sw-cleanup.tsx);
 *  - on the tunnel, the API mints a parent-domain Secure cookie, not a host-only one
 *    (a host-only cookie was invisible to admin and looped forever).
 *
 * E2E_TARGET defaulting is inlined (mirrors playwright.config + global-setup) — a
 * shared local .ts import trips Playwright's TS loader on Node 23.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const AUTH_APP =
  process.env.NEXT_PUBLIC_AUTH_APP_URL || (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");
const DEMO_ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

test("authenticated user reaches the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("body")).toBeVisible();
});

test("authenticated root resolves to the dashboard, even with the service worker active", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);
  // Reload so any registered service worker controls the navigation; a poisoned
  // start-url cache would replay a cached redirect here and strand us off /dashboard.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
});

// Fresh context with no session cookie.
test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/", "/dashboard"]) {
    test(`a protected route (${path}) 307-redirects to the auth app sign-in (no local /sign-in)`, async ({
      request,
    }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([301, 302, 307, 308]).toContain(res.status());
      expect(res.headers()["location"] ?? "").toContain(`${AUTH_APP}/sign-in`);
    });
  }
});

// The host-only-cookie bug only manifests across real subdomains; assert the live
// tunnel API mints a parent-domain, Secure cookie so admin and api both see it.
test("the API issues a parent-domain, Secure session cookie (no host-only loop)", async ({ request }) => {
  test.skip(!IS_NGROK, "cross-subdomain cookie scope only applies to the tunnel stack");
  const res = await request.post(`${API_URL}/iam/sessions`, { data: DEMO_ORGANISER });
  expect(res.ok()).toBeTruthy();
  const setCookie = res.headers()["set-cookie"] ?? "";
  expect(setCookie).toMatch(/auth_token=/);
  expect(setCookie).toMatch(/Domain=\.dev\.uprise\.org\.au/i);
  expect(setCookie).toMatch(/Secure/i);
});
