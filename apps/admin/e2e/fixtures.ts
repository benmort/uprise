import { test as base, expect, type Page } from "@playwright/test";
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
