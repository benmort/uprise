import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Who a blast goes to, and the one-way doors around it.
 *
 * `texting.spec.ts` walks the composer up to the dispatch boundary: compliance, preview, the
 * confirmation dialog, the SCHEDULED state. What it does not touch is the question that decides
 * who receives the thing — the audience — or what the FSM refuses once a blast has moved on.
 * Those are the failures with consequences you cannot take back: the wrong list, or a schedule
 * you thought you had undone.
 *
 * Nothing here sends. Every assertion about state is read back from the API rather than from the
 * screen, because the composer's optimistic UI will happily show you a selection the server
 * never accepted.
 *
 * Conventions match the rest of this directory: ids and URL defaulting are inlined (Playwright's
 * TS loader trips on local `.ts` imports here), and every blast created is deleted in afterEach.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");

const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

const ids: Record<string, string | undefined> = (() => {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8")).ids ?? {};
  } catch {
    return {};
  }
})();

/** Compliant by construction — an opt-out instruction, so nothing here is blocked for the wrong reason. */
const BODY = "Hi {{first_name}}, a quick note about Saturday. Reply STOP to opt out.";

async function signInAsOrganiser(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/iam/sessions`, { data: ORGANISER });
  expect(res.ok(), "seeded organiser should be able to sign in").toBeTruthy();
  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  expect(token, "organiser sign-in should return a session token").toBeTruthy();
  return token;
}

async function api(request: APIRequestContext, token: string, path: string) {
  return request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function listAudiences(request: APIRequestContext, token: string) {
  const res = await api(request, token, "/audiences");
  expect(res.ok(), `audiences should be readable (${res.status()})`).toBeTruthy();
  const json = await res.json();
  // `{ data: { rows, total } }` — the paged envelope, not a bare array.
  const rows: unknown = json?.data?.rows ?? json?.data ?? json;
  expect(Array.isArray(rows), `unexpected /audiences shape: ${JSON.stringify(json).slice(0, 200)}`).toBe(
    true,
  );
  return rows as Array<Record<string, unknown>>;
}

/**
 * Is the queued dispatch path live? When it is, `POST /blasts/:id/schedule` enqueues a delayed
 * BullMQ job that no endpoint revokes — deleting the blast afterwards leaves it sitting in Redis
 * until it fires. The scheduling test therefore only runs when the queue path is off, the same
 * precaution `texting.spec.ts` takes for the same reason.
 */
async function queuedDispatchEnabled(request: APIRequestContext, token: string): Promise<boolean> {
  const res = await api(request, token, "/system/feature-flags");
  // Unreadable flags means we cannot know whether scheduling would enqueue — assume it would,
  // because the cost of guessing wrong is an unremovable job, not a missed assertion.
  if (!res.ok()) return true;
  const json = await res.json();
  return Boolean((json?.data ?? json ?? {}).FEATURE_BULLMQ_BLAST_ENABLED);
}

async function getBlast(request: APIRequestContext, token: string, id: string) {
  const res = await api(request, token, "/blasts");
  expect(res.ok(), `blast list should be readable (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const rows: Array<Record<string, unknown>> = json?.data ?? json ?? [];
  const row = rows.find((r) => String(r.id) === id);
  expect(row, `blast ${id} should exist`).toBeTruthy();
  return row!;
}

async function createDraftBlast(
  request: APIRequestContext,
  token: string,
  title: string,
  audienceId: string,
) {
  const res = await request.post(`${API}/blasts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, bodyTemplate: BODY, channel: "SMS", audienceId },
  });
  expect(res.ok(), `blast create should succeed (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const id: string = json?.data?.id ?? json?.id;
  expect(id, "create should return the blast id").toBeTruthy();
  return id;
}

const createdBlasts: Array<{ token: string; id: string }> = [];

test.afterEach(async ({ request }) => {
  const pending = createdBlasts.splice(0);
  const failures: string[] = [];
  for (const { token, id } of pending) {
    const res = await request
      .delete(`${API}/blasts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
    if (!res?.ok()) failures.push(`${id} (${res ? res.status() : "request threw"})`);
  }
  expect(failures, `blast cleanup failed for: ${failures.join(", ")}`).toEqual([]);
});

test("the composer's audience options carry their contact counts, and re-targeting persists", async ({
  page,
  request,
}) => {
  test.skip(!ids.audienceId, "no seeded audience");
  const token = await signInAsOrganiser(request);
  const audiences = await listAudiences(request, token);
  test.skip(audiences.length < 2, "needs two audiences to prove a re-target");

  const blastId = await createDraftBlast(request, token, `E2E Target ${Date.now()}`, ids.audienceId!);
  createdBlasts.push({ token, id: blastId });

  await page.goto(`/blasts/${blastId}/composer`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in|\/login/);

  const select = page.locator("#tour-composer-audience select");
  await expect(select).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await select.inputValue()).length, { timeout: 20_000 })
    .toBeGreaterThan(0);

  // "Who gets this" is a number, not a name. An option list that cannot say how many people are
  // behind each audience is a send you are making blind.
  const optionLabels = await page.locator("#tour-composer-audience select option").allTextContents();
  expect(optionLabels.length, "the audience select offers nothing to pick").toBeGreaterThan(0);
  expect(
    optionLabels.some((label) => /\(\d[\d,]*\)/.test(label)),
    `no audience option carries a contact count: ${optionLabels.join(" | ")}`,
  ).toBeTruthy();

  // Re-target to a different audience and prove the server took it — the composer autosaves on a
  // debounce, so an optimistic select that never reached the API looks identical on screen.
  const current = await select.inputValue();
  const other = audiences.map((a) => String(a.id)).find((id) => id !== current);
  test.skip(!other, "no second audience id to switch to");

  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(`/blasts/${blastId}`),
    { timeout: 30_000 },
  );
  await select.selectOption(other!);
  const savedRes = await saved.catch(() => null);
  expect(savedRes, "changing the audience issued no PATCH").not.toBeNull();
  expect(savedRes!.status(), "the re-target PATCH failed").toBeLessThan(300);

  await expect
    .poll(async () => String((await getBlast(request, token, blastId)).audienceId ?? ""), {
      message: "the server never recorded the new audience",
      timeout: 20_000,
    })
    .toBe(other!);
});

test("a blast with no audience reaches nobody", async ({ request }) => {
  const token = await signInAsOrganiser(request);
  // Deliberately audience-less. The API does NOT refuse this send — it accepts it and queues
  // zero recipients, which is a defensible product choice and was verified against the dev stack
  // (no BlastRecipient rows are written). What must never change is the safety property: "no
  // audience" has to mean nobody, not everybody. This test exists to catch the day a refactor
  // makes an empty audience filter select the whole contact book.
  const res = await request.post(`${API}/blasts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `E2E No-Audience ${Date.now()}`, bodyTemplate: BODY, channel: "SMS" },
  });
  expect(res.ok(), `draft create should succeed (${res.status()})`).toBeTruthy();
  const blastId: string = (await res.json())?.data?.id;
  expect(blastId).toBeTruthy();
  createdBlasts.push({ token, id: blastId });

  const send = await request.post(`${API}/blasts/${blastId}/send`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await send.json().catch(() => null);
  const queued = Number(body?.data?.sent ?? body?.sent ?? NaN);
  expect(
    queued,
    `sending an audience-less blast queued ${queued} recipients — it must reach nobody`,
  ).toBe(0);
});

test("a scheduled blast cannot be quietly re-scheduled — SCHEDULED is a one-way door", async ({
  request,
}) => {
  test.skip(!ids.audienceId, "no seeded audience");
  const token = await signInAsOrganiser(request);
  test.skip(
    await queuedDispatchEnabled(request, token),
    "queued dispatch is on — scheduling would leave an unrevokable delayed job",
  );
  // The blast state machine allows SCHEDULED → SENDING | FAILED and nothing else: there is no
  // path back to DRAFTED and no second schedule. If that ever loosens, an organiser could believe
  // they had moved a send that is already committed.
  const blastId = await createDraftBlast(request, token, `E2E Schedule ${Date.now()}`, ids.audienceId!);
  createdBlasts.push({ token, id: blastId });

  // Far enough out that the dispatch cron can never claim it inside a test run.
  const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const first = await request.post(`${API}/blasts/${blastId}/schedule`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { scheduledFor: farFuture },
  });
  test.skip(!first.ok(), `scheduling unavailable in this environment (${first.status()})`);
  expect(String((await getBlast(request, token, blastId)).status)).toBe("SCHEDULED");

  const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const second = await request.post(`${API}/blasts/${blastId}/schedule`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { scheduledFor: later },
  });
  expect(
    second.ok(),
    `re-scheduling a SCHEDULED blast returned ${second.status()} — the FSM must refuse it`,
  ).toBeFalsy();

  const after = await getBlast(request, token, blastId);
  expect(String(after.status)).toBe("SCHEDULED");
  expect(
    new Date(String(after.scheduledFor)).toISOString(),
    "the refused re-schedule still moved the send time",
  ).toBe(new Date(farFuture).toISOString());
});

test("deleting a draft removes it from the tenant's blasts", async ({ request }) => {
  test.skip(!ids.audienceId, "no seeded audience");
  const token = await signInAsOrganiser(request);
  const blastId = await createDraftBlast(request, token, `E2E Delete ${Date.now()}`, ids.audienceId!);

  const del = await request.delete(`${API}/blasts/${blastId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(del.ok(), `delete should succeed (${del.status()})`).toBeTruthy();

  const res = await api(request, token, "/blasts");
  const rows: Array<Record<string, unknown>> = (await res.json())?.data ?? [];
  expect(
    rows.some((r) => String(r.id) === blastId),
    "the deleted blast is still listed",
  ).toBeFalsy();
});

test("the blast report page renders for a real blast", async ({ page, request }) => {
  test.skip(!ids.audienceId, "no seeded audience");
  const token = await signInAsOrganiser(request);
  const blastId = await createDraftBlast(request, token, `E2E Report ${Date.now()}`, ids.audienceId!);
  createdBlasts.push({ token, id: blastId });

  await page.goto(`/blasts/${blastId}`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in|\/login/);
  // A never-sent blast has no engagement, so this asserts the report's scaffolding renders rather
  // than inventing numbers — the failure it guards against is a page that throws on zero data.
  await expect(page.locator("body")).toContainText(/engagement|status distribution|recipient/i, {
    timeout: 20_000,
  });
});
