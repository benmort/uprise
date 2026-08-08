import { test } from "./fixtures";
import { expect } from "@playwright/test";

/**
 * The two status pages, which are two different security postures on the same health snapshot.
 *
 * The public one (marketing, no session) must render services and history and must NOT contain a
 * commit sha, a Vercel project name or an app origin — the whole reason the public payload is
 * assembled server-side rather than filtered in the browser. The admin one is @SuperAdmin at the
 * API, so the seeded organiser session gets the no-permission state, not an empty table.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const MKT = process.env.MARKETING_URL || (IS_NGROK ? "https://dev.uprise.org.au" : "http://localhost:3003");

test.describe("public status page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders every public service, the 90-day bar and an incident section", async ({ page }) => {
    await page.goto(`${MKT}/status`);

    await expect(page.getByRole("heading", { name: /uprise status/i })).toBeVisible();
    // The five rollups from PUBLIC_SERVICES, in registry order.
    for (const service of [
      "Organiser workspace",
      "Canvasser app",
      "Supporter actions",
      "Messaging",
      "Website",
    ]) {
      await expect(page.getByText(service, { exact: true })).toBeVisible();
    }
    // .first(): with no recent incidents the page ALSO says "No incidents recorded in the
    // last 90 days.", which would trip strict mode on incident-free (i.e. healthy) data.
    await expect(page.getByText(/last 90 days/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /recent incidents/i })).toBeVisible();
    // Either a summary word or the "can't reach the status service" admission — never nothing.
    await expect(
      page.getByText(/all systems operational|systems are|can't be checked|can't reach/i).first(),
    ).toBeVisible();
  });

  test("leaks nothing internal into the page", async ({ page }) => {
    await page.goto(`${MKT}/status`);
    await expect(page.getByRole("heading", { name: /uprise status/i })).toBeVisible();

    const html = await page.content();
    // Project names, origins and deploy states belong to the super-admin payload only.
    expect(html).not.toContain("uprise-api");
    expect(html).not.toContain("uprise-admin");
    expect(html).not.toContain("backboard.railway");
    expect(html).not.toMatch(/READY|CANCELED/);
  });
});

test("admin status page refuses a non super-admin", async ({ page }) => {
  // The seeded e2e session is a tenant organiser, not a platform super-admin: the API answers
  // 403 and the page must say so rather than rendering an empty operator table.
  await page.goto("/status");

  await expect(page.getByRole("heading", { name: /system status/i })).toBeVisible();
  await expect(page.getByText(/permission|not authorised|access/i).first()).toBeVisible();
  // No operator columns should have rendered.
  await expect(page.getByRole("columnheader", { name: /commit/i })).toHaveCount(0);
});
