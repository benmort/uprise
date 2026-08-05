import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Text blasting for an organiser who is ALREADY signed in – the everyday path, which had no
 * journey cover. `inbox-blasts.spec.ts` proves the composer and the channel surfaces render;
 * this walks the organiser through them: new blast → confirm the audience → write a compliant
 * message → reach the point of dispatch.
 *
 * Nothing here sends. The dispatch boundary is the confirmation dialog (asserted, then cancelled)
 * and the SCHEDULED state (asserted server-side, far enough in the future that the dispatch cron
 * can never claim it). The seeded contacts carry ACMA drama-reserved numbers, but "the numbers are
 * fake" is not a reason to fire a real Twilio send from a test.
 *
 * This spec uses the default storageState – the organiser session minted by global-setup. A fresh
 * login is the invite specs' job, not this one's.
 *
 * Every blast it creates, it deletes: `clear:test-residue` has no blast pattern, so an abandoned
 * draft here is residue nothing sweeps.
 *
 * The URL defaulting is inlined rather than imported: every spec here does the same, because
 * Playwright's TS config loader has tripped on local `.ts` imports in this directory.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");

const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

/** Seeded ids resolved by global-setup (inlined read – no shared local `.ts` import). */
const ids: Record<string, string | undefined> = (() => {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, ".auth/context.json"), "utf8")).ids ?? {};
  } catch {
    return {};
  }
})();

/** A body with no opt-out instruction – the composer's compliance check must object to this. */
const NON_COMPLIANT_BODY =
  "Hi {{first_name}}, we're doorknocking in {{location}} this Saturday. Can you join us?";
/** The same message, made compliant. */
const COMPLIANT_BODY = `${NON_COMPLIANT_BODY} Reply STOP to opt out.`;

/** Mint an opaque session token over the API – used for the fixture create/verify/delete. */
async function signInAsOrganiser(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/iam/sessions`, { data: ORGANISER });
  expect(res.ok(), "seeded organiser should be able to sign in").toBeTruthy();
  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  expect(token, "organiser sign-in should return a session token").toBeTruthy();
  return token;
}

/**
 * `audienceId` is passed deliberately: the composer resolves the blast and the audience list in
 * two concurrent effects, and a blast with no audience can have its selection clobbered back to ""
 * by whichever lands second – which then fails validation for a reason that has nothing to do with
 * what the test is asserting.
 */
async function createDraftBlast(
  request: APIRequestContext,
  token: string,
  title: string,
  audienceId: string,
) {
  const res = await request.post(`${API}/blasts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, bodyTemplate: COMPLIANT_BODY, channel: "SMS", audienceId },
  });
  expect(res.ok(), `blast create should succeed (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const id: string = json?.data?.id ?? json?.id;
  expect(id, "create should return the blast id").toBeTruthy();
  return id;
}

/**
 * Give back what we took. Cleanup runs in afterEach rather than a `finally` on purpose: a failing
 * assertion inside `finally` REPLACES the error that actually failed the test, and Playwright
 * reports a hook error alongside the test's own. It also still runs when a test times out midway.
 *
 * Deleting by ID is the only cleanup that actually matches. `clear:test-residue` sweeps by title
 * prefix, and a blast created from the "New Blast" button is persisted with the app's own default
 * title – the `E2E Blast <stamp>` name the composer test types only reaches the row when the
 * 1.2s debounced autosave fires, which a test that ends early never waits for. So there is no
 * name-based backstop for this spec: if the delete below does not happen, nothing else will.
 */
const createdBlasts: Array<{ token: string; id: string }> = [];

test.afterEach(async ({ request }) => {
  const pending = createdBlasts.splice(0);
  // Delete everything FIRST, assert afterwards: a bare `expect` inside the loop would abandon the
  // remaining blasts the moment one delete failed, turning one leak into several.
  const failures: string[] = [];
  for (const { token, id } of pending) {
    const res = await request
      .delete(`${API}/blasts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
    if (!res?.ok()) failures.push(`${id} (${res ? res.status() : "request threw"})`);
  }
  // Asserted, not best-effort: a quiet failure here leaves a blast in the demo tenant that
  // nothing ever sweeps up.
  expect(failures, `blast cleanup failed for: ${failures.join(", ")}`).toEqual([]);
});

/**
 * Is the queued blast-dispatch path live? When it is, `POST /blasts/:id/schedule` enqueues a
 * BullMQ job delayed until `scheduledFor`, and there is no endpoint that revokes one – deleting
 * the blast afterwards leaves the delayed job sitting in Redis until it fires. So the half of the
 * scheduling test that writes durable state only runs when the queue path is off.
 */
async function queuedDispatchEnabled(request: APIRequestContext, token: string): Promise<boolean> {
  const res = await request.get(`${API}/system/feature-flags`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Unreadable flags means we cannot know whether scheduling would enqueue – assume it would,
  // because the failure mode of guessing wrong is an unremovable job, not a missed assertion.
  if (!res.ok()) return true;
  const json = await res.json();
  return Boolean((json?.data ?? json ?? {}).FEATURE_BULLMQ_BLAST_ENABLED);
}

async function blastStatus(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(`${API}/blasts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `blast list should be readable (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const rows: Array<Record<string, unknown>> = json?.data ?? json ?? [];
  const row = rows.find((r) => String(r.id) === id);
  expect(row, `blast ${id} should still exist`).toBeTruthy();
  return { status: String(row!.status), scheduledFor: row!.scheduledFor as string | null };
}

/** Record every send attempt from the moment the page opens, so "we never dispatched" is evidence. */
function watchForDispatch(page: Page, blastId: string): string[] {
  const attempts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes(`/blasts/${blastId}/send`)) attempts.push(r.url());
  });
  return attempts;
}

test("an organiser composes a text blast and reaches the send confirmation without dispatching", async ({
  page,
  request,
}) => {
  const token = await signInAsOrganiser(request);

  await page.goto("/channels/text", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in|\/login/);
  await expect(page.getByRole("heading", { name: /text \(sms\)/i })).toBeVisible();

  // Arm before the click: a "New Blast" button that quietly issues nothing is exactly the class of
  // failure this suite exists to catch.
  const created = page.waitForResponse(
    (r) => r.request().method() === "POST" && /\/blasts$/.test(new URL(r.url()).pathname),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /new blast/i }).click();
  const createdRes = await created.catch(() => null);
  expect(createdRes, "the New Blast button issued no POST /blasts").not.toBeNull();
  expect(createdRes!.status(), "blast create should succeed").toBeLessThan(300);

  await page.waitForURL(/\/blasts\/[^/]+\/composer/, { timeout: 45_000 });
  const blastId = new URL(page.url()).pathname.split("/")[2];
  expect(blastId, "the composer URL should carry the new blast id").toBeTruthy();
  createdBlasts.push({ token, id: blastId });
  const dispatchAttempts = watchForDispatch(page, blastId);

  // The audience is pre-selected from the tenant's most recent one; the organiser's job is to
  // confirm it, so assert there is something real to confirm rather than an empty select.
  const audience = page.locator("#tour-composer-audience select");
  await expect(audience).toBeVisible();
  await expect
    .poll(async () => (await audience.inputValue()).length, {
      message: "no audience is selected – the blast has nobody to go to",
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const options = page.locator("#tour-composer-audience select option");
  expect(await options.count(), "the audience select offers nothing to pick").toBeGreaterThan(0);
  // Re-pick it explicitly: the organiser's actual gesture, and it proves the control is live.
  await audience.selectOption(await audience.inputValue());

  // Wait for the debounced autosave (1.2s) to actually land the name. Two reasons: a composer
  // that silently drops what you type is a real bug, and until it lands the row still carries the
  // default title the "New Blast" button created it with – so the id in `createdBlasts` is the
  // only thing in the world that can identify this blast for cleanup.
  const named = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(`/blasts/${blastId}`),
    { timeout: 30_000 },
  );
  await page.locator("#tour-composer-name input").fill(`E2E Blast ${Date.now()}`);
  const namedRes = await named.catch(() => null);
  expect(namedRes, "the composer never saved the campaign name").not.toBeNull();
  expect(namedRes!.status(), "the autosave PATCH failed").toBeLessThan(300);

  const message = page.locator("#tour-composer-message");
  await message.fill(NON_COMPLIANT_BODY);
  await expect(
    page.locator("#tour-composer-compliance"),
    "a message with no opt-out instruction must be flagged before it can be sent",
  ).toContainText(/missing opt-out language/i);

  await message.fill(COMPLIANT_BODY);
  await expect(page.locator("#tour-composer-compliance")).toContainText(
    /no compliance warnings detected/i,
  );

  // The preview is what the organiser trusts before pressing send: a merge tag still showing as
  // `{{first_name}}` means recipients would receive it literally.
  const preview = page.locator("#tour-composer-preview");
  await expect(preview, "the preview never rendered the message at all").toContainText(
    /doorknocking in/i,
  );
  await expect(preview).not.toContainText("{{first_name}}");
  await expect(preview).not.toContainText("{{location}}");

  // The dispatch boundary. Opening the confirmation must not send anything.
  await page.getByRole("button", { name: /^send now$/i }).click();
  // Named, not bare: the shell's WorkspaceLoadingOverlay is also role="alertdialog" and is
  // portalled to <body>, so an unscoped getByRole would be ambiguous the moment one is on screen.
  const confirm = page.getByRole("alertdialog", { name: /send blast now\?/i });
  await expect(confirm).toBeVisible();
  await expect(
    confirm,
    "the confirmation must say what pressing it does – this is the last stop before real SMS",
  ).toContainText(/start sending messages to your selected audience immediately/i);
  await expect(confirm.getByRole("button", { name: /send blast/i })).toBeEnabled();

  await confirm.getByRole("button", { name: /cancel/i }).click();
  await expect(confirm).toBeHidden();
  expect(dispatchAttempts, "the composer dispatched without a confirmed send").toEqual([]);

  // Server-side truth, not just the UI's word for it.
  expect((await blastStatus(request, token, blastId)).status).toBe("DRAFTED");
});

test("a composed blast reaches SCHEDULED without dispatching", async ({ page, request }) => {
  test.skip(!ids.audienceId, "no seeded audience");
  const token = await signInAsOrganiser(request);
  const queuedDispatch = await queuedDispatchEnabled(request, token);
  // Created per-test over the API, never in beforeAll: `retries: 1` is on and a scheduled blast
  // cannot be scheduled twice (the FSM forbids SCHEDULED → SCHEDULED), so a shared fixture would
  // fail the retry for the wrong reason.
  const blastId = await createDraftBlast(request, token, `E2E Blast ${Date.now()}`, ids.audienceId!);
  createdBlasts.push({ token, id: blastId });

  await page.goto(`/blasts/${blastId}/composer`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in|\/login/);
  const dispatchAttempts = watchForDispatch(page, blastId);
  // The load-triggered autosave: the composer sets campaignName + template from the API, which
  // trips its own 1.2s debounce and PATCHes the blast back. Bounded, not asserted – it is a
  // side effect of loading, not the thing under test.
  const settled = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(`/blasts/${blastId}`),
    { timeout: 15_000 },
  );
  await expect(page.locator("#tour-composer-message")).toHaveValue(COMPLIANT_BODY, {
    timeout: 20_000,
  });
  await settled.catch(() => null);

  // Scheduling lives behind the advanced-settings disclosure.
  await page.getByText(/proof and scheduling options/i).click();
  // A year out: `dispatchDueScheduled` only claims blasts whose scheduledFor has already passed, so
  // even if the cleanup never ran, nothing could send.
  const sendAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const localValue = `${sendAt.getFullYear()}-${String(sendAt.getMonth() + 1).padStart(2, "0")}-${String(sendAt.getDate()).padStart(2, "0")}T09:00`;
  await page.locator('input[type="datetime-local"]').fill(localValue);

  // Picking a time is not sending, and the composer must not treat it as one.
  await expect(page.getByRole("button", { name: /schedule blast/i })).toBeEnabled();
  expect(dispatchAttempts, "choosing a send time must not dispatch").toEqual([]);

  /**
   * Everything past here writes state no test can take back. `POST /blasts/:id/schedule` enqueues
   * a BullMQ job delayed until `scheduledFor` when the queue path is on, and there is no endpoint
   * that cancels a scheduled blast – deleting the row in afterEach orphans the job, which then
   * sits in Redis for a year. That is a real product gap (a scheduled blast should be cancellable),
   * not something to paper over here, so the durable half runs only when nothing would be queued.
   */
  test.skip(
    queuedDispatch,
    "FEATURE_BULLMQ_BLAST_ENABLED is on: scheduling would enqueue a delayed BullMQ job that no API can revoke",
  );

  // An in-flight autosave here is what makes "Schedule Blast" issue nothing: the handler runs
  // proof-then-schedule against a row another request is still writing.
  await expect(
    page.getByText(/Autosave: Saving/i),
    "an autosave is still in flight – scheduling now races it",
  ).toBeHidden();

  // "Schedule Blast" is proof-THEN-schedule: a failed /proofed returns early and no /schedule POST
  // is ever issued. Waiting on both means the failure names the step that broke instead of
  // reporting a silent button.
  const proofed = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes(`/blasts/${blastId}/proofed`),
    { timeout: 30_000 },
  );
  const scheduled = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes(`/blasts/${blastId}/schedule`),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /schedule blast/i }).click();
  const proofedRes = await proofed.catch(() => null);
  expect(proofedRes, "no POST to /proofed was issued – the button stopped before it").not.toBeNull();
  expect(proofedRes!.status(), "marking the blast proofed failed, so it was never scheduled").toBeLessThan(300);
  const scheduledRes = await scheduled.catch(() => null);
  expect(scheduledRes, "no POST to /schedule was issued").not.toBeNull();
  expect(scheduledRes!.status(), "schedule should succeed").toBeLessThan(300);

  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // The state the API actually holds – a badge is the UI's claim, not the record.
  const persisted = await blastStatus(request, token, blastId);
  expect(persisted.status).toBe("SCHEDULED");
  expect(
    new Date(persisted.scheduledFor ?? 0).getTime(),
    "a blast scheduled in the past would be dispatched on the next cron tick",
  ).toBeGreaterThan(Date.now());
  expect(dispatchAttempts, "scheduling must not send").toEqual([]);
});
