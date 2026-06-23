import { test, expect } from "@playwright/test";

/**
 * Auth e2e against the doc-14 cookie/SSO model. The global storageState (set in
 * global-setup) carries the httpOnly auth_token cookie, so authed specs need no
 * client-side injection. The web app has no /login of its own anymore — an
 * unauthenticated request is 307-redirected to the standalone auth app.
 */
const AUTH_APP = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";

test("authenticated user reaches the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("body")).toBeVisible();
});

// Fresh context with no session cookie.
test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a protected route 307-redirects to the auth app login (no local /login)", async ({ request }) => {
    const res = await request.get("/dashboard", { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    expect(res.headers()["location"] ?? "").toContain(`${AUTH_APP}/login`);
  });
});
