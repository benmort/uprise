import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The volunteers roster must not be able to demote the workspace OWNER.
 *
 * The roster's edit dialog offers exactly two roles — Volunteer and Organiser — and it sent
 * whatever the select showed on save. An OWNER row fell through to the first option, so opening an
 * owner's row and pressing Save (to fix a typo in their phone number, say) silently demoted the
 * only account that can manage the workspace. Nothing in the UI said so and nothing on the server
 * refused it.
 *
 * The client-side half is unit-tested (volunteer-roles). This pins the SERVER half, which is the
 * half that actually protects the workspace: a direct PATCH must be refused no matter what any
 * client sends.
 */
const IS_NGROK = process.env.E2E_TARGET === "ngrok";
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_NGROK ? "https://api.dev.uprise.org.au/api/v1" : "http://localhost:3001/api/v1");

const ORGANISER = { email: "demo.organiser@uprise.test", password: "demo-organiser-pw" };

async function signIn(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/iam/sessions`, { data: ORGANISER });
  expect(res.ok(), "seeded organiser should be able to sign in").toBeTruthy();
  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  expect(token, "sign-in should return a session token").toBeTruthy();
  return token;
}

test.describe("roster — the workspace owner is not editable here", () => {
  test("a direct PATCH cannot demote the OWNER", async ({ request }) => {
    const token = await signIn(request);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request.get(`${API}/canvass/volunteers`, { headers: auth });
    expect(list.ok(), "the roster should be readable").toBeTruthy();
    const rows = (await list.json())?.data ?? [];
    const owner = (rows as Array<{ id: string; role?: string }>).find((r) => r.role === "OWNER");
    test.skip(!owner, "no OWNER on the seeded roster");

    const res = await request.patch(`${API}/canvass/volunteers/${owner!.id}`, {
      headers: auth,
      data: { role: "VOLUNTEER" },
    });

    expect(
      res.ok(),
      `demoting the OWNER returned ${res.status()} — the roster must refuse it`,
    ).toBeFalsy();
    // A named code, so the UI can explain WHERE owners are managed rather than showing a bare 403.
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).toContain("OWNER_NOT_EDITABLE_HERE");

    // And the refusal is real: the owner still holds the role.
    const after = await request.get(`${API}/canvass/volunteers`, { headers: auth });
    const stillOwner = ((await after.json())?.data ?? []).find(
      (r: { id: string }) => r.id === owner!.id,
    );
    expect(stillOwner?.role).toBe("OWNER");
  });

  /**
   * The WHOLE owner row is off-limits from the roster — not just the role field.
   *
   * That is deliberate, and the reason is the endpoint rather than the field: updateVolunteer
   * writes TenantMember.role and User.passwordHash directly, bypassing TenantsService where the
   * seniority and last-owner invariants live. The same edit dialog carries a password field, so
   * letting an "innocuous" edit through would hand an organiser the owner's password and with it
   * their account. Owners are managed on the members surface, which has the real guards.
   */
  test("even a name-only edit to the OWNER row is refused, pointing at Settings", async ({ request }) => {
    const token = await signIn(request);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request.get(`${API}/canvass/volunteers`, { headers: auth });
    const rows = (await list.json())?.data ?? [];
    const owner = (rows as Array<{ id: string; role?: string; name?: string }>).find(
      (r) => r.role === "OWNER",
    );
    test.skip(!owner, "no OWNER on the seeded roster");

    const res = await request.patch(`${API}/canvass/volunteers/${owner!.id}`, {
      headers: auth,
      data: { displayName: "Renamed by an organiser" },
    });

    expect(
      res.ok(),
      `a name edit to the owner returned ${res.status()} — the roster must refuse the whole row`,
    ).toBeFalsy();
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).toContain("OWNER_NOT_EDITABLE_HERE");
  });

  // A non-owner row must stay fully editable — the guard is about owners, not about freezing the
  // roster. Without this, refusing every PATCH would satisfy the tests above.
  test("a VOLUNTEER row is still editable", async ({ request }) => {
    const token = await signIn(request);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request.get(`${API}/canvass/volunteers`, { headers: auth });
    const rows = (await list.json())?.data ?? [];
    const volunteer = (rows as Array<{ id: string; role?: string; displayName?: string; name?: string }>).find(
      (r) => r.role === "VOLUNTEER",
    );
    test.skip(!volunteer, "no VOLUNTEER on the seeded roster");

    const keep = volunteer!.displayName ?? volunteer!.name ?? "Demo Volunteer";
    const res = await request.patch(`${API}/canvass/volunteers/${volunteer!.id}`, {
      headers: auth,
      data: { displayName: keep },
    });

    expect(
      res.ok(),
      `editing an ordinary volunteer returned ${res.status()} — the guard is over-broad`,
    ).toBeTruthy();
  });
});
