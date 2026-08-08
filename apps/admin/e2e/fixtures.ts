import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Per-worker session + seeded ids.
 *
 * The suite ran at `workers: 1` because raising it made things measurably worse against one
 * shared tenant: 109 passed / 2 failed / 5 flaky serially became 104 / 7 / 13 at four workers,
 * and every newly-failing test was one that creates or mutates state. global-setup now provisions
 * a tenant per worker and writes `state-<i>.json` / `context-<i>.json` for each; this hands each
 * worker its own, so two files racing can no longer see each other's blasts, audiences or
 * campaigns.
 *
 * Import `test` and `expect` from here rather than from @playwright/test. Specs that need the
 * volunteer session still call `test.use({ storageState: volunteerStatePath(...) })`.
 */

/** The organiser storageState for a worker, written by global-setup. */
export function orgStatePath(index: number): string {
  return resolve(__dirname, ".auth", `state-${index}.json`);
}

/** The volunteer storageState for a worker (the field PWA reads its id from localStorage). */
export function volunteerStatePath(index: number): string {
  return resolve(__dirname, ".auth", `volunteer-${index}.json`);
}

export type SeededIds = Record<string, string | undefined>;

function readIds(index: number): SeededIds {
  // Fall back to the unsuffixed file so a partially-migrated checkout still runs.
  for (const name of [`context-${index}.json`, "context.json"]) {
    try {
      return (JSON.parse(readFileSync(resolve(__dirname, ".auth", name), "utf8")).ids ?? {}) as SeededIds;
    } catch {
      // try the next one
    }
  }
  return {};
}

export const test = base.extend<{ ids: SeededIds }, { workerStorageState: string; workerIds: SeededIds }>({
  // Worker-scoped so the file is resolved once per worker, not once per test.
  workerStorageState: [
    async ({}, use, workerInfo) => {
      await use(orgStatePath(workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],
  workerIds: [
    async ({}, use, workerInfo) => {
      await use(readIds(workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],
  storageState: ({ workerStorageState }, use) => use(workerStorageState),
  ids: ({ workerIds }, use) => use(workerIds),
});

export { expect, type Page };

/**
 * Navigate and assert the page rendered as this tenant's authenticated user.
 *
 * The URL check runs immediately after `domcontentloaded`, which is deliberately early: it names
 * a sign-in bounce clearly instead of letting it surface as a confusing content mismatch twenty
 * seconds later.
 */
export async function gotoOk(page: Page, path: string, expected: RegExp): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page, `no sign-in bounce from ${path}`).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.locator("body")).toContainText(expected, { timeout: 20_000 });
}


// Same defaulting as playwright.config / global-setup, inlined for the same reason.
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");

/**
 * The tenant this worker should act in: its own if it has one, otherwise the PRIMARY demo tenant.
 *
 * The primary id is explicit rather than implied. Falling back to "the session's first
 * membership" stopped being stable the moment worker tenants existed, and it stays unstable
 * afterwards — those extra memberships persist in the database, so even a later serial run
 * signs in as a user who belongs to several tenants.
 */
export function workerTenantId(index = Number(process.env.TEST_PARALLEL_INDEX ?? 0)): string | undefined {
  for (const name of [`context-${index}.json`, "context.json"]) {
    try {
      const ctx = JSON.parse(readFileSync(resolve(__dirname, ".auth", name), "utf8"));
      return (ctx.tenantId ?? ctx.primaryTenantId ?? undefined) as string | undefined;
    } catch {
      // try the next one
    }
  }
  return undefined;
}

/**
 * Sign in over the API AND pin the session to this worker's tenant.
 *
 * Plain sign-in is not enough once the suite runs in parallel. Provisioning a tenant per worker
 * makes the demo users members of every one of them, so a fresh token's active tenant is whichever
 * membership the API happened to resolve first — and a spec that then creates a blast, an invite
 * or an audience does it in some other worker's tenant, where its own assertions cannot see it.
 * That was five of the six failures in the first four-worker run.
 *
 * Worker 0 has no tenant of its own (it uses the primary demo tenant), so the pin is skipped and
 * the behaviour is exactly what it always was.
 */
export async function signInScoped(
  request: APIRequestContext,
  credentials: { email: string; password: string },
): Promise<{ token: string; tenantId: string | undefined }> {
  const res = await request.post(`${API}/iam/sessions`, { data: credentials });
  expect(res.ok(), `seeded user ${credentials.email} should be able to sign in`).toBeTruthy();
  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  expect(token, "sign-in should return a session token").toBeTruthy();

  const tenantId = workerTenantId();
  if (tenantId) {
    const pinned = await request.post(`${API}/iam/select-tenant`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { tenantId },
    });
    expect(pinned.ok(), `should be able to pin the session to ${tenantId}`).toBeTruthy();
    return { token, tenantId };
  }

  // No context file at all (a checkout that has never run global-setup). Nothing better to say
  // than the session's own first membership.
  const memberships = json?.data?.memberships ?? json?.memberships ?? [];
  return { token, tenantId: memberships[0]?.tenantId as string | undefined };
}
