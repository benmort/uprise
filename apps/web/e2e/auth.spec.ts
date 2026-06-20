import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Self-contained auth helper (relative TS imports trip Playwright's resolver in this
// repo's bundler tsconfig, so each spec inlines this rather than sharing a module).
const ctx = JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8"));
async function authed(page: Page) {
  await page.addInitScript(
    ([u, p, cid]) => {
      try {
        window.sessionStorage.setItem("yarn_auth_credentials", JSON.stringify({ username: u, password: p }));
      } catch {}
      try {
        if (cid) window.localStorage.setItem("yarns.canvasserId", cid);
      } catch {}
    },
    [ctx.user, ctx.pass, ctx.ids?.canvasserId ?? ""],
  );
}

test("authenticated user reaches the dashboard", async ({ page }) => {
  await authed(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("body")).toBeVisible();
});

test("unauthenticated visit redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});

test("login page renders for signing in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
