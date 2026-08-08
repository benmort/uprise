import { signInScoped, test } from "./fixtures";
import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Invitation acceptance, end to end, in every engine.
 *
 * This exists because two production incidents on the same journey were invisible to the
 * suite, for two different reasons:
 *
 *  1. An owner accepted successfully – user, membership, session and welcome email all
 *     committed – and then the browser never made a single authenticated call. The failure
 *     was AFTER a successful accept, in the landing. Asserting a 200 from the accept would
 *     not have caught it, so this spec asserts the app actually reaches the API afterwards.
 *  2. On Firefox, the accept POST never left the browser at all: the preview GET succeeded,
 *     nothing followed, and the invitation stayed `pending`. A Chromium-only suite cannot see
 *     that, so this spec runs on all three engines and asserts the POST was issued – a request
 *     the browser never sends must fail loudly, not time out vaguely.
 *
 * The URL defaulting is inlined rather than imported: every spec here does the same, because
 * Playwright's TS config loader has tripped on local `.ts` imports in this directory.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");
const AUTH_APP =
  process.env.NEXT_PUBLIC_AUTH_APP_URL ||
  (IS_NGROK ? "https://auth.dev.uprise.org.au" : "http://localhost:3002");

const OWNER = { email: "demo.owner@uprise.test", password: "demo-owner-pw" };

// A cold browser: a real invitee arrives with no session at all. This also means the invite
// page is exercised without the organiser cookie that every other authed spec carries.
test.use({ storageState: { cookies: [], origins: [] } });

/** Mint an opaque session token + resolve the tenant, over the API (no UI login needed). */
async function signInAsOwner(request: APIRequestContext) {
  // The tenant comes from signInScoped, NOT from memberships[0]. Once a tenant exists per worker
  // the demo owner is a member of all of them, so memberships[0] picked whichever the API
  // resolved first — and the invites this spec creates, plus the seats it counts afterwards,
  // landed in some other worker's tenant.
  const { token, tenantId } = await signInScoped(request, OWNER);
  return { token, tenantId: tenantId as string };
}

/**
 * Issue a real invitation and return its token. `POST /tenants/:id/invitations` returns the
 * token to the issuer, so no mailbox and no database access is needed. (The LIST endpoint
 * deliberately withholds it – it is a bearer credential.)
 */
async function createInvite(
  request: APIRequestContext,
  auth: { token: string; tenantId: string },
  role: "OWNER" | "ORGANISER" | "VOLUNTEER",
) {
  const email = `e2e.invite.${role.toLowerCase()}.${Date.now()}@uprise.test`;
  const res = await request.post(`${API}/tenants/${auth.tenantId}/invitations`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { email, role },
  });
  expect(res.ok(), `invitation create should succeed (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const inviteToken: string = json?.data?.token ?? json?.token;
  expect(inviteToken, "create should return the invite token").toBeTruthy();
  return { email, inviteToken };
}

for (const role of ["OWNER", "ORGANISER"] as const) {
  test(`accepting a ${role} invite issues the POST and lands in an authenticated admin`, async ({
    page,
    request,
  }) => {
    // Created inside the test, never in beforeAll: retries are on and accept is single-use,
    // so a shared invite would fail the retry for the wrong reason.
    const auth = await signInAsOwner(request);
    const { email, inviteToken } = await createInvite(request, auth, role);

    // Surface anything the page throws – for a browser that silently refuses to send a
    // request, the console is the only evidence, and it is what production could not give us.
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    const failedRequests: string[] = [];
    page.on("requestfailed", (r) =>
      failedRequests.push(`${r.method()} ${r.url()} – ${r.failure()?.errorText}`),
    );

    // No return_to, exactly like the emailed link.
    await page.goto(`${AUTH_APP}/invite/${inviteToken}`);
    await expect(page.getByText(/You're invited to join/i)).toBeVisible();

    // Arm both waiters BEFORE clicking. This is the whole point of the spec.
    const acceptPost = page.waitForResponse(
      (r) => r.url().includes("/iam/invite/accept") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    const authCheck = page.waitForResponse(
      (r) => r.url().includes("/auth/check") && r.ok(),
      { timeout: 45_000 },
    );

    await page.locator("#firstName").fill("E2E");
    await page.locator("#lastName").fill("Invitee");
    await page.locator("#password").fill("e2e-invite-pw-123");
    await page.getByRole("button", { name: /accept invitation/i }).click();

    // (2) The POST actually left the browser. On the engine that regressed, this is the line
    // that fails – with a trace – instead of the flow dying silently.
    const accepted = await acceptPost.catch(() => null);
    expect(
      accepted,
      `no POST to /iam/invite/accept was issued. console=${JSON.stringify(consoleErrors)} failed=${JSON.stringify(failedRequests)}`,
    ).not.toBeNull();
    expect(accepted!.status(), "accept should succeed").toBeLessThan(300);

    // (1) …and the app then reached the API as the new user. A 200 from accept is NOT enough:
    // the incident had a perfect accept followed by a session that was never used again.
    await page.waitForURL(/\/dashboard|\/getting-started/, { timeout: 45_000 });
    const checked = await authCheck.catch(() => null);
    expect(
      checked,
      `landed but never made an authenticated call. console=${JSON.stringify(consoleErrors)}`,
    ).not.toBeNull();

    // Give the seat back. Every accepted invite consumes one, and the demo tenant is on the
    // default Growth plan (teamMembers: 10) – without this the journey poisons its own
    // fixture after a handful of runs and starts failing with PLAN_LIMIT, which reads like a
    // product bug. Best-effort: a failed cleanup must not fail an otherwise-passing test
    // (`pnpm --filter api clear:test-residue` is the backstop).
    // Resolve the new member from the tenant's member list rather than from the accept response.
    // Reading `accepted.json()` looks tidier but does not work here: completeAuth() navigates the
    // page the instant the accept resolves, and the browser discards the body – every run of this
    // cleanup got `undefined` and deleted nothing. The invite email carries a timestamp, so
    // matching on it is exact, and the assertion below means it cannot silently match nothing.
    const members = await request.get(`${API}/tenants/${auth.tenantId}/members`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(members.ok(), `member list should be readable (${members.status()})`).toBeTruthy();
    const rows = (await members.json())?.data ?? [];
    const mine = rows.filter(
      (r: { user?: { email?: string } }) => r.user?.email?.toLowerCase() === email.toLowerCase(),
    );
    expect(mine.length, `the accepted invitee (${email}) is not in the member list`).toBe(1);
    const newUserId: string | undefined = mine[0]?.userId;
    expect(newUserId, "the member row should carry the new user id").toBeTruthy();
    const removed = await request.delete(
      `${API}/tenants/${auth.tenantId}/members/${newUserId}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    // Assert it: a cleanup that quietly fails refills the tenant's seats and the journey
    // starts failing with PLAN_LIMIT a few runs later, looking like a product bug.
    expect(removed.ok(), `seat cleanup failed (${removed.status()}) for ${email}`).toBeTruthy();
  });
}

test("an already-accepted invitation shows the error state rather than a blank screen", async ({
  page,
  request,
}) => {
  const auth = await signInAsOwner(request);
  const { inviteToken } = await createInvite(request, auth, "ORGANISER");

  // Consume it over the API so the browser meets a genuinely spent token.
  const consumed = await request.post(`${API}/iam/invite/accept`, {
    data: { token: inviteToken, displayName: "Spent Token", password: "e2e-invite-pw-123" },
  });
  expect(consumed.ok()).toBeTruthy();

  await page.goto(`${AUTH_APP}/invite/${inviteToken}`);
  // Assert the SPECIFIC refusal, not just the "Invitation Error" heading: that heading also
  // renders for a network-level "Failed to fetch", so matching it alone would pass even when
  // the browser never reached the API at all.
  await expect(page.getByText(/Invalid or expired invitation/i)).toBeVisible();
});

test("a revoked invitation cannot be accepted from the browser", async ({ page, request }) => {
  const auth = await signInAsOwner(request);
  const { inviteToken } = await createInvite(request, auth, "ORGANISER");

  const list = await request.get(`${API}/tenants/${auth.tenantId}/invitations`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const rows = (await list.json())?.data ?? [];
  // The list must NOT carry tokens – it is a bearer credential and any organiser can read it.
  expect(rows.every((r: Record<string, unknown>) => !("token" in r))).toBeTruthy();

  const pending = rows.find((r: { status: string }) => r.status === "pending");
  await request.delete(`${API}/tenants/${auth.tenantId}/invitations/${pending.id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });

  await page.goto(`${AUTH_APP}/invite/${inviteToken}`);
  // Assert the SPECIFIC refusal, not just the "Invitation Error" heading: that heading also
  // renders for a network-level "Failed to fetch", so matching it alone would pass even when
  // the browser never reached the API at all.
  await expect(page.getByText(/Invalid or expired invitation/i)).toBeVisible();
});
