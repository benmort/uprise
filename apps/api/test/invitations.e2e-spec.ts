import type { INestApplication } from "@nestjs/common";
import { bootE2EApp, client, data } from "./utils/e2e-app";

/**
 * Invitation accept e2e – the SESSION COOKIE on the wire (meld doc 14).
 *
 * The unit test on sessionCookieOptions asserts an options object; nothing asserted the
 * header a browser actually receives. That gap matters: an accepted invite that commits
 * everything server-side and is then never used again by the browser looks identical to a
 * healthy accept in the data, so the cookie's wire format is the one thing worth pinning –
 * name, HttpOnly, SameSite, Path, expiry – plus proof it authenticates the next request.
 *
 * Single-use and the password floor are covered here for the same reason: they are the
 * accept path's guarantees, and only a real HTTP round trip exercises the global
 * ValidationPipe + exception filter that `bootE2EApp` wires exactly as production does.
 */

const SESSION_COOKIE = "auth_token";
const HOUR_MS = 60 * 60 * 1000;

/** The Set-Cookie line for the session cookie, or undefined. */
function sessionCookieHeader(headers: Record<string, unknown>): string | undefined {
  const raw = headers["set-cookie"];
  const lines = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return lines.find((line) => line.startsWith(`${SESSION_COOKIE}=`));
}

/** `name=value` only – the attributes must not be replayed on the request. */
function cookiePair(setCookieLine: string): string {
  return setCookieLine.split(";")[0];
}

function attribute(setCookieLine: string, name: string): string | undefined {
  return setCookieLine
    .split(";")
    .slice(1)
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(name.toLowerCase()));
}

describe("API e2e – invitation accept + session cookie", () => {
  let app: INestApplication;
  let api: ReturnType<typeof client>;
  let tenantId: string;
  const stamp = Date.now();

  /** Issue a fresh invitation and hand back its single-use token. */
  async function issueInvite(email: string): Promise<string> {
    const issued = await api
      .post(`/api/v1/tenants/${tenantId}/invitations`)
      .send({ email, role: "VOLUNTEER" });
    expect([200, 201]).toContain(issued.status);
    return data(issued.body).token as string;
  }

  beforeAll(async () => {
    app = await bootE2EApp();
    api = client(app);
    const created = await api
      .post("/api/v1/tenants")
      .send({ slug: `e2e-cookie-${stamp}`, name: `E2E Cookie ${stamp}` });
    expect([200, 201]).toContain(created.status);
    tenantId = data(created.body).id as string;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("accepting an invite sets an HttpOnly, SameSite=Lax, Path=/ session cookie that authenticates the next call", async () => {
    const email = `e2e.cookie.${stamp}@uprise.test`;
    const token = await issueInvite(email);

    const accepted = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Cookie", password: "invitee-strong-pw" });
    expect([200, 201]).toContain(accepted.status);

    const setCookie = sessionCookieHeader(accepted.headers);
    expect(setCookie).toBeDefined();
    const line = setCookie as string;
    expect(attribute(line, "HttpOnly")).toBeDefined();
    expect(attribute(line, "SameSite")?.toLowerCase()).toBe("samesite=lax");
    expect(attribute(line, "Path")).toBe("Path=/");

    // Bounded rather than exact: the session TTL is 24h, so anything inside half a day
    // to two days is the intended cookie and a session-cookie/epoch regression is not.
    const expires = attribute(line, "Expires");
    expect(expires).toBeDefined();
    const expiresAt = new Date((expires as string).slice("Expires=".length)).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 12 * HOUR_MS);
    expect(expiresAt).toBeLessThan(Date.now() + 48 * HOUR_MS);

    // The cookie the browser would send back – no Authorization header at all. This is the
    // server-side half of "the session was created and then never used".
    const check = await api.raw.get("/api/v1/auth/check").set("Cookie", cookiePair(line));
    expect(check.status).toBe(200);
    const user = data(check.body).user;
    expect(user?.id).toEqual(expect.any(String));
    expect(user?.memberships?.map((m: { tenantId: string }) => m.tenantId)).toContain(tenantId);
  });

  it("rejects a second accept with the same token (single use)", async () => {
    const token = await issueInvite(`e2e.cookie.reuse.${stamp}@uprise.test`);
    const first = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Reuse", password: "invitee-strong-pw" });
    expect([200, 201]).toContain(first.status);

    const second = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Reuse", password: "invitee-strong-pw" });
    expect(second.status).toBe(400);
    expect(second.body.ok).toBe(false);
    expect(sessionCookieHeader(second.headers)).toBeUndefined();
  });

  it("rejects a 4-character password at the pipe, before the service runs", async () => {
    const token = await issueInvite(`e2e.cookie.weak.${stamp}@uprise.test`);
    const res = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Weak", password: "abcd" });
    expect(res.status).toBe(400);
    // class-validator's phrasing, not the service's "Password must be at least 8 characters" –
    // that difference is what proves the global ValidationPipe refused it first.
    expect(String(res.body.error?.message)).toContain("longer than or equal to 8");
    expect(sessionCookieHeader(res.headers)).toBeUndefined();

    // Nothing was consumed: the invitation is still usable with a sound password.
    const retry = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Weak", password: "invitee-strong-pw" });
    expect([200, 201]).toContain(retry.status);
  });
});
