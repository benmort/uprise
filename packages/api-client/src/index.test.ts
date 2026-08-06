import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  getApiUrl,
  getAuthAppUrl,
  getActionAppUrl,
  loginRedirectUrl,
  request,
  auth,
  profile,
  orgProfile,
  sessions,
  tenants,
  marketing,
  plans,
  platformStatus,
  autodialer,
  actionPages,
  publicActions,
  telephony,
  messageTemplates,
  transactionalCalls,
  emailProvisioning,
  tenantLogoUrl,
  integrations,
} from "./index";

const BASE = "http://localhost:3001/api/v1";

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

/** A JSON success response envelope `{ data }`, which `request` unwraps to `data`. */
function okResponse(data: unknown = { ok: true }, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  };
}

beforeEach(() => {
  fetchMock = vi.fn(async () => okResponse());
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** [url, init] of the Nth (default first) fetch call. */
function call(n = 0): [string, RequestInit] {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return [url, init];
}

function bodyOf(init: RequestInit): unknown {
  return JSON.parse(init.body as string);
}

describe("environment URL helpers", () => {
  it("getApiUrl falls back to the local default and honours NEXT_PUBLIC_API_URL", () => {
    expect(getApiUrl()).toBe(BASE);
    const prev = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api/v1";
    try {
      expect(getApiUrl()).toBe("https://api.example.test/api/v1");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = prev;
    }
  });

  it("auth + action app URLs fall back to their local dev origins", () => {
    expect(getAuthAppUrl()).toBe("http://localhost:3002");
    expect(getActionAppUrl()).toBe("http://localhost:3004");
  });
});

describe("loginRedirectUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the organiser /sign-in with just return_to", () => {
    expect(loginRedirectUrl("https://field.test/x")).toBe(
      "http://localhost:3002/sign-in?return_to=" + encodeURIComponent("https://field.test/x"),
    );
  });

  it("honours a runtime login path + org (the field volunteer flow)", () => {
    vi.stubGlobal("window", { __LOGIN_PATH__: "/volunteer/sign-in", __LOGIN_ORG__: "acme" });
    expect(loginRedirectUrl("https://field.test/")).toBe(
      "http://localhost:3002/volunteer/sign-in?org=acme&return_to=" + encodeURIComponent("https://field.test/"),
    );
  });
});

describe("request() transport wrapper", () => {
  it("prefixes the API base, includes credentials and a JSON content-type, and unwraps `data`", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ hello: "world" }));
    const res = await request<{ hello: string }>("/ping");
    expect(res).toEqual({ ok: true, data: { hello: "world" } });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/ping`);
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("maps a non-ok response to { ok:false, error, status } using the server message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "forbidden here" } }),
    });
    const res = await request("/secret");
    expect(res).toEqual({ ok: false, error: "forbidden here", status: 403 });
  });

  it("falls back to a generic message when the error body has no message", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const res = await request("/boom");
    expect(res).toEqual({ ok: false, error: "Request failed (500)", status: 500 });
  });

  it("flags a fetch rejection as a network error, with no status", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    const res = await request("/down");
    expect(res).toEqual({ ok: false, error: "Failed to fetch", networkError: true });
    // A blocked request is the one case where "nothing reached the server" is true, so
    // it must not be confusable with a timeout or a cancellation.
    expect(res).not.toHaveProperty("timedOut");
    expect(res).not.toHaveProperty("aborted");
  });

  it("stringifies a non-Error rejection and still flags it", async () => {
    fetchMock.mockRejectedValueOnce("blocked by client");
    const res = await request("/down");
    expect(res).toEqual({ ok: false, error: "blocked by client", networkError: true });
  });

  it("does not flag an HTTP error as a network error – it keeps its status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: "already a member" } }),
    });
    const res = await request("/iam/invite/accept");
    expect(res).toEqual({ ok: false, error: "already a member", status: 409 });
    expect(res).not.toHaveProperty("networkError");
  });

  it("times out a hung request as timedOut, NOT networkError – it may have landed", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
          }),
      );
      const pending = request("/hang");
      await vi.advanceTimersByTimeAsync(30_000);
      const res = await pending;
      expect(res).toEqual({
        ok: false,
        error: "The request timed out after 30 seconds.",
        timedOut: true,
      });
      // alex's incident: a timed-out accept POST can still have committed the user,
      // the membership and the session. Claiming networkError here is how a member
      // gets told their network is broken.
      expect(res).not.toHaveProperty("networkError");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a multipart upload a longer ceiling than a JSON call", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
          }),
      );
      const form = new FormData();
      form.append("file", new Blob(["x"]), "big.jpg");
      let settled = false;
      const pending = request("/upload", { method: "POST", body: form }).then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: "The request timed out after 120 seconds.",
        timedOut: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("honours a caller's timeoutMs, so a known-slow endpoint is not cut off at 30s", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
          }),
      );
      let settled = false;
      const pending = request("/canvass/walk-lists/rebuild", { method: "POST" }, { timeoutMs: 120_000 }).then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: "The request timed out after 120 seconds.",
        timedOut: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a mid-flight caller abort as aborted, not a network failure", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("The user aborted a request.")));
        }),
    );
    const ac = new AbortController();
    const pending = request("/slow", { signal: ac.signal });
    ac.abort();
    const res = await pending;
    // The caller's signal still cancels the fetch (unmount / latest-wins), but "you
    // navigated away" must never render as "your network is broken".
    expect(res).toEqual({ ok: false, error: "The user aborted a request.", aborted: true });
    expect(res).not.toHaveProperty("networkError");
  });

  it("never dispatches when the caller's signal is already aborted", async () => {
    const res = await request("/slow", { signal: AbortSignal.abort() });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, aborted: true });
    expect(res).not.toHaveProperty("networkError");
  });

  it("uses the abort reason as the error when the caller supplies one", async () => {
    const res = await request("/slow", { signal: AbortSignal.abort(new Error("superseded by a newer search")) });
    expect(res).toEqual({ ok: false, error: "superseded by a newer search", aborted: true });
  });

  it("attaches the captcha token as the cf-turnstile-response header", async () => {
    await request("/guarded", { method: "POST", body: "{}" }, { captchaToken: "tok-123" });
    const [, init] = call();
    expect((init.headers as Record<string, string>)["cf-turnstile-response"]).toBe("tok-123");
  });

  it("does not force a JSON content-type when the body is FormData", async () => {
    const form = new FormData();
    form.append("k", "v");
    await request("/upload", { method: "POST", body: form });
    const [, init] = call();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("auth flows", () => {
  it("login POSTs credentials to /iam/sessions", async () => {
    await auth.login("a@b.com", "pw");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/sessions`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ email: "a@b.com", password: "pw" });
  });

  it("register POSTs the signup payload to /auth/register and forwards the captcha token", async () => {
    await auth.register(
      { email: "a@b.com", password: "longenoughpw", orgName: "Acme", slug: "acme" },
      "cap-1",
    );
    const [url, init] = call();
    expect(url).toBe(`${BASE}/auth/register`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ email: "a@b.com", password: "longenoughpw", orgName: "Acme", slug: "acme" });
    expect((init.headers as Record<string, string>)["cf-turnstile-response"]).toBe("cap-1");
  });

  it("logout DELETEs /iam/sessions", async () => {
    await auth.logout();
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/sessions`);
    expect(init.method).toBe("DELETE");
  });

  it("phoneCheck POSTs challenge + code to /iam/phone/check", async () => {
    await auth.phoneCheck("ch1", "0000");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/phone/check`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ challengeId: "ch1", code: "0000" });
  });

  it("requestMagicLink POSTs the email and forwards the captcha token as a header", async () => {
    await auth.requestMagicLink("me@x.com", "cap-9");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/magic-link`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ email: "me@x.com" });
    expect((init.headers as Record<string, string>)["cf-turnstile-response"]).toBe("cap-9");
  });

  it("resetPassword POSTs the token + new password", async () => {
    await auth.resetPassword("rtok", "newpass");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/reset-password`);
    expect(bodyOf(init)).toEqual({ token: "rtok", password: "newpass" });
  });

  it("tenants.brandBySlug GETs the public brand endpoint with an encoded slug", async () => {
    await tenants.brandBySlug("common threads");
    const [url] = call();
    expect(url).toBe(`${BASE}/tenants/brand?slug=common%20threads`);
  });

  it("tenantLogoUrl prefers landscape, falls back to block, else null", () => {
    expect(tenantLogoUrl({ logoLandscapeUrl: "wide.png", logoBlockUrl: "block.png" })).toBe("wide.png");
    expect(tenantLogoUrl({ logoLandscapeUrl: null, logoBlockUrl: "block.png" })).toBe("block.png");
    expect(tenantLogoUrl({ logoLandscapeUrl: null, logoBlockUrl: null })).toBeNull();
    expect(tenantLogoUrl(null)).toBeNull();
    expect(tenantLogoUrl(undefined)).toBeNull();
  });

  it("phoneVerify POSTs challenge + code to /iam/phone/verify", async () => {
    await auth.phoneVerify("ch1", "0000");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/phone/verify`);
    expect(bodyOf(init)).toEqual({ challengeId: "ch1", code: "0000" });
  });

  it("phoneStart POSTs the phone to /iam/phone/start", async () => {
    await auth.phoneStart("+61400000000", "cap-1");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/phone/start`);
    expect(bodyOf(init)).toEqual({ phone: "+61400000000" });
  });

  it("phoneResend POSTs the challenge to /iam/phone/resend", async () => {
    await auth.phoneResend("ch2", "cap-2");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/phone/resend`);
    expect(bodyOf(init)).toEqual({ challengeId: "ch2" });
  });

  it("phoneCheck POSTs challenge + code to /iam/phone/check (mid-flow OTP validation)", async () => {
    await auth.phoneCheck("ch3", "1234");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/phone/check`);
    expect(bodyOf(init)).toEqual({ challengeId: "ch3", code: "1234" });
  });

  it("devPeekOtp GETs the OTP with an encoded challengeId query", async () => {
    await auth.devPeekOtp("ch/2");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/dev/otp?challengeId=ch%2F2`);
    expect(init.method).toBeUndefined();
  });

  it("previewInvite encodes the token into the path", async () => {
    await auth.previewInvite("a/b c");
    const [url] = call();
    expect(url).toBe(`${BASE}/iam/invite/a%2Fb%20c`);
  });

  it("openJoinPreview encodes the campaign id into the path", async () => {
    await auth.openJoinPreview("camp 7");
    const [url] = call();
    expect(url).toBe(`${BASE}/iam/open-join/camp%207`);
  });

  it("openJoinList hits the opportunities feed, with no query when unscoped", async () => {
    await auth.openJoinList();
    expect(call()[0]).toBe(`${BASE}/iam/open-join/opportunities`);
  });

  it("openJoinList appends the encoded tenant slug when scoped", async () => {
    await auth.openJoinList("common threads");
    expect(call()[0]).toBe(`${BASE}/iam/open-join/opportunities?tenant=common%20threads`);
  });

  it("selectTenant POSTs the tenantId", async () => {
    await auth.selectTenant("t1");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/select-tenant`);
    expect(bodyOf(init)).toEqual({ tenantId: "t1" });
  });
});

describe("profile + account", () => {
  it("get GETs /iam/profile", async () => {
    await profile.get();
    expect(call()[0]).toBe(`${BASE}/iam/profile`);
  });

  it("update PUTs the profile body", async () => {
    await profile.update({ displayName: "New Name" } as never);
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/profile`);
    expect(init.method).toBe("PUT");
    expect(bodyOf(init)).toEqual({ displayName: "New Name" });
  });

  it("selectAvatar POSTs to the encoded avatar select path", async () => {
    await profile.selectAvatar("av 1");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/avatars/av%201/select`);
    expect(init.method).toBe("POST");
  });

  it("uploadAvatar sends multipart FormData without a JSON content-type", async () => {
    await profile.uploadAvatar(new Blob(["x"]));
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/avatars/upload`);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("orgProfile", () => {
  it("update PATCHes the org profile", async () => {
    await orgProfile.update({ name: "Acme" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/org-profile`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ name: "Acme" });
  });

  it("updateContact encodes the contact id and PATCHes", async () => {
    await orgProfile.updateContact("c/9", { firstName: "Sam" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/org-profile/contacts/c%2F9`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ firstName: "Sam" });
  });
});

describe("sessions management", () => {
  it("list GETs /iam/my-sessions", async () => {
    await sessions.list();
    expect(call()[0]).toBe(`${BASE}/iam/my-sessions`);
  });

  it("revoke DELETEs the encoded session id", async () => {
    await sessions.revoke("s 1");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/my-sessions/s%201`);
    expect(init.method).toBe("DELETE");
  });

  it("revokeOthers POSTs an empty body", async () => {
    await sessions.revokeOthers();
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/my-sessions/revoke-others`);
    expect(bodyOf(init)).toEqual({});
  });
});

describe("tenants", () => {
  it("checkAvailability encodes the slug into the query", async () => {
    await tenants.checkAvailability("my org");
    expect(call()[0]).toBe(`${BASE}/tenants/availability?slug=my%20org`);
  });

  it("get encodes the tenant id", async () => {
    await tenants.get("t/1");
    expect(call()[0]).toBe(`${BASE}/tenants/t%2F1`);
  });

  it("update PATCHes the tenant with the given fields", async () => {
    await tenants.update("t1", { name: "Renamed", slug: "renamed" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/tenants/t1`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ name: "Renamed", slug: "renamed" });
  });

  it("addMember POSTs email + role to the members collection", async () => {
    await tenants.addMember("t1", { email: "new@x.com", role: "ORGANISER" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/tenants/t1/members`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ email: "new@x.com", role: "ORGANISER" });
  });

  it("listJoinRequests appends an encoded status filter when given", async () => {
    await tenants.listJoinRequests("t1", "PENDING");
    expect(call()[0]).toBe(`${BASE}/tenants/t1/join-requests?status=PENDING`);
    fetchMock.mockClear();
    await tenants.listJoinRequests("t1");
    expect(call()[0]).toBe(`${BASE}/tenants/t1/join-requests`);
  });

  it("updateMemberRole PATCHes the role for an encoded user id", async () => {
    await tenants.updateMemberRole("t1", "u 2", "VOLUNTEER");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/tenants/t1/members/u%202`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ role: "VOLUNTEER" });
  });

  it("createInvitation POSTs to the invitations collection", async () => {
    await tenants.createInvitation("t1", { email: "inv@x.com", role: "VOLUNTEER" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/tenants/t1/invitations`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ email: "inv@x.com", role: "VOLUNTEER" });
  });

  it("createInvitation forwards a composed message + subject", async () => {
    await tenants.createInvitation("t1", {
      phone: "+61400000000",
      role: "VOLUNTEER",
      message: "Join: {{invite_link}}",
      subject: "Hi",
    });
    expect(bodyOf(call()[1])).toEqual({
      phone: "+61400000000",
      role: "VOLUNTEER",
      message: "Join: {{invite_link}}",
      subject: "Hi",
    });
  });

  it("messageTemplates.list GETs the templates collection", async () => {
    await messageTemplates.list();
    const [url, init] = call();
    expect(url).toBe(`${BASE}/message-templates`);
    expect(init.method ?? "GET").toBe("GET");
  });
});

describe("marketing + plans", () => {
  it("contact POSTs the form body with the captcha header", async () => {
    await marketing.contact({ name: "A", email: "a@x.com", message: "hi" }, "cap");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/marketing/contact`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toMatchObject({ name: "A", email: "a@x.com", message: "hi" });
    expect((init.headers as Record<string, string>)["cf-turnstile-response"]).toBe("cap");
  });

  it("newsletter POSTs just the email", async () => {
    await marketing.newsletter("sub@x.com");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/marketing/newsletter`);
    expect(bodyOf(init)).toEqual({ email: "sub@x.com" });
  });

  it("plans.listPublic GETs the public plans", async () => {
    await plans.listPublic();
    expect(call()[0]).toBe(`${BASE}/plans/public`);
  });

  it("platformStatus.publicStatus GETs the public status without bouncing on 401", async () => {
    await platformStatus.publicStatus();
    expect(call()[0]).toBe(`${BASE}/platform-status/public`);
  });
});

describe("autodialer", () => {
  it("list builds the filter query string", async () => {
    await autodialer.list({ status: "ACTIVE", behaviour: "survey", search: "ring", limit: 10, offset: 20 });
    expect(call()[0]).toBe(
      `${BASE}/autodialer/campaigns?status=ACTIVE&behaviour=survey&search=ring&limit=10&offset=20`,
    );
  });

  it("get / preflight encode the id", async () => {
    await autodialer.get("dc 1");
    expect(call(0)[0]).toBe(`${BASE}/autodialer/campaigns/dc%201`);
    await autodialer.preflight("dc 1");
    expect(call(1)[0]).toBe(`${BASE}/autodialer/campaigns/dc%201/preflight`);
  });

  it("create POSTs, update PATCHes, archive DELETEs", async () => {
    await autodialer.create({ name: "New campaign", survey: true });
    expect(call(0)[0]).toBe(`${BASE}/autodialer/campaigns`);
    expect(call(0)[1]?.method).toBe("POST");

    await autodialer.update("dc1", { name: "Renamed" });
    expect(call(1)[0]).toBe(`${BASE}/autodialer/campaigns/dc1`);
    expect(call(1)[1]?.method).toBe("PATCH");

    await autodialer.archive("dc1");
    expect(call(2)[1]?.method).toBe("DELETE");
  });

  it("lifecycle actions POST to their sub-paths", async () => {
    await autodialer.activate("dc1");
    expect(call(0)[0]).toBe(`${BASE}/autodialer/campaigns/dc1/activate`);
    await autodialer.pause("dc1");
    expect(call(1)[0]).toBe(`${BASE}/autodialer/campaigns/dc1/pause`);
    await autodialer.resume("dc1");
    expect(call(2)[0]).toBe(`${BASE}/autodialer/campaigns/dc1/resume`);
    await autodialer.complete("dc1");
    expect(call(3)[0]).toBe(`${BASE}/autodialer/campaigns/dc1/complete`);
    await autodialer.clone("dc1");
    expect(call(4)[0]).toBe(`${BASE}/autodialer/campaigns/dc1/clone`);
  });

  it("upsertQuestions PUTs the graph body", async () => {
    await autodialer.upsertQuestions("dc1", { authoring: [{ question: "Q?", options: ["Yes"] }] });
    expect(call()[0]).toBe(`${BASE}/autodialer/campaigns/dc1/questions`);
    expect(call()[1]?.method).toBe("PUT");
    expect(bodyOf(call()[1])).toEqual({ authoring: [{ question: "Q?", options: ["Yes"] }] });
  });
});

describe("telephony + email provisioning", () => {
  it("tenants.getSetup GETs the encoded setup path", async () => {
    await tenants.getSetup("t 1");
    expect(call()[0]).toBe(`${BASE}/tenants/t%201/setup`);
  });

  it("emailProvisioning.senderPrefill GETs the prefill", async () => {
    await emailProvisioning.senderPrefill();
    expect(call()[0]).toBe(`${BASE}/email-provisioning/prefill`);
  });

  it("emailProvisioning.requestSetup POSTs the (optional) body to /requests", async () => {
    await emailProvisioning.requestSetup({ domain: "acme.org.au", notes: "please" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/email-provisioning/requests`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ domain: "acme.org.au", notes: "please" });
    fetchMock.mockClear();
    await emailProvisioning.requestSetup();
    expect(bodyOf(call()[1])).toEqual({});
  });

  it("emailProvisioning.listRequests appends only the provided filters", async () => {
    await emailProvisioning.listRequests({ status: "OPEN", tenantId: "t/1" });
    expect(call()[0]).toBe(`${BASE}/email-provisioning/requests?status=OPEN&tenantId=t%2F1`);
    fetchMock.mockClear();
    await emailProvisioning.listRequests();
    expect(call()[0]).toBe(`${BASE}/email-provisioning/requests`);
  });

  it("emailProvisioning.withdrawRequest / declineRequest POST to the encoded action paths", async () => {
    await emailProvisioning.withdrawRequest("r 1");
    expect(call()[0]).toBe(`${BASE}/email-provisioning/requests/r%201/withdraw`);
    expect(call()[1].method).toBe("POST");
    fetchMock.mockClear();
    await emailProvisioning.declineRequest("r 1", "no domain");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/email-provisioning/requests/r%201/decline`);
    expect(bodyOf(init)).toEqual({ reason: "no domain" });
  });

  it("telephony.startRun POSTs the provisioning body", async () => {
    await telephony.startRun({
      tenantId: "t1",
      mode: "SUBACCOUNT",
      complianceInput: {
        legalName: "Acme",
        contactFirstName: "A",
        contactLastName: "B",
        email: "a@x.com",
        address: { street: "1 St", city: "Town", region: "VIC", postalCode: "3000" },
      },
    });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/provisioning-runs`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toMatchObject({ tenantId: "t1", mode: "SUBACCOUNT" });
  });

  /**
   * A BYO tenant whose Twilio account has already cleared the AU regulatory review supplies
   * its approved bundle + address (and the account's region) at start.
   *
   * Be precise about what guards what here. `startRun` is `JSON.stringify(body)`, a straight
   * pass-through, and the client-side change is a TYPE-only widening – types erase, so no
   * runtime assertion in this file can fail if those four fields are deleted from the
   * declaration. What DOES fail is `tsc`: the literal below is an excess-property check
   * against the parameter type, so dropping a field from the type turns this file red under
   * `pnpm --filter @uprise/api-client typecheck` (which includes src/*.test.ts). The
   * assertion is still worth having – it pins that the body is sent verbatim rather than
   * rebuilt field-by-field, which is how a field would go missing at runtime.
   */
  it("telephony.startRun carries the BYO bundle, address, region and edge", async () => {
    const bundleSid = `BU${"a".repeat(32)}`;
    const addressSid = `AD${"b".repeat(32)}`;
    await telephony.startRun({
      mode: "BYO",
      byoAccountSid: `AC${"1".repeat(32)}`,
      byoAuthToken: "test-token",
      byoBundleSid: bundleSid,
      byoAddressSid: addressSid,
      byoRegion: "au1",
      byoEdge: "sydney",
      complianceInput: {
        legalName: "Acme",
        contactFirstName: "A",
        contactLastName: "B",
        email: "a@x.com",
        address: { street: "1 St", city: "Town", region: "VIC", postalCode: "3000" },
      },
    });
    expect(bodyOf(call()[1])).toMatchObject({
      mode: "BYO",
      byoBundleSid: bundleSid,
      byoAddressSid: addressSid,
      byoRegion: "au1",
      byoEdge: "sydney",
    });
  });

  it("telephony.listRuns appends an encoded tenantId query only when provided", async () => {
    await telephony.listRuns("t/1");
    expect(call()[0]).toBe(`${BASE}/telephony/provisioning-runs?tenantId=t%2F1`);
    fetchMock.mockClear();
    await telephony.listRuns();
    expect(call()[0]).toBe(`${BASE}/telephony/provisioning-runs`);
  });

  it("telephony.releaseNumber POSTs to the encoded release path", async () => {
    await telephony.releaseNumber("n 1");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/numbers/n%201/release`);
    expect(init.method).toBe("POST");
  });

  it("telephony.listNumbers appends an encoded tenantId query only when provided", async () => {
    await telephony.listNumbers("t/1");
    expect(call()[0]).toBe(`${BASE}/telephony/numbers?tenantId=t%2F1`);
    fetchMock.mockClear();
    await telephony.listNumbers();
    expect(call()[0]).toBe(`${BASE}/telephony/numbers`);
  });

  it("telephony.setNickname PATCHes the encoded number path with the nickname body", async () => {
    await telephony.setNickname("n 1", "Field team");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/numbers/n%201`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toMatchObject({ nickname: "Field team" });
  });

  it("telephony.setPurpose PATCHes the number with a purpose body", async () => {
    await telephony.setPurpose("n 1", "transactional");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/numbers/n%201`);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ purpose: "transactional" });
  });

  // The auth token only ever travels inbound, so the body has to carry it verbatim – and the
  // path must be the connect endpoint, not an account-scoped one: there is no account id yet,
  // which is the entire reason this call exists.
  it("telephony.connectByoAccount POSTs the credentials to the unscoped connect path", async () => {
    await telephony.connectByoAccount({
      accountSid: `AC${"a".repeat(32)}`,
      authToken: "s3cr3t",
      region: "au1",
      edge: "sydney",
    });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/accounts/connect`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({
      accountSid: `AC${"a".repeat(32)}`,
      authToken: "s3cr3t",
      region: "au1",
      edge: "sydney",
    });
  });

  it("telephony.listAdoptableNumbers GETs the account's adoptable numbers, id encoded", async () => {
    await telephony.listAdoptableNumbers("acct 1");
    expect(call()[0]).toBe(`${BASE}/telephony/accounts/acct%201/adoptable-numbers`);
  });

  // The claim flags are the difference between leaving a live production voice configuration
  // alone and overwriting it, so the body has to carry exactly what the caller passed.
  it("telephony.adoptNumber POSTs the SID and hook opt-ins to the account's adopt path", async () => {
    await telephony.adoptNumber("acct 1", {
      phoneNumberSid: `PN${"c".repeat(32)}`,
      nickname: "Field line",
      claimVoiceHook: true,
    });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/accounts/acct%201/adopt-number`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({
      phoneNumberSid: `PN${"c".repeat(32)}`,
      nickname: "Field line",
      claimVoiceHook: true,
    });
  });

  it("telephony.compliancePrefill GETs the prefill", async () => {
    await telephony.compliancePrefill();
    expect(call()[0]).toBe(`${BASE}/telephony/compliance-prefill`);
  });

  it("telephony.startRun carries numberType when provided", async () => {
    await telephony.startRun({
      mode: "SUBACCOUNT",
      numberType: "local",
      complianceInput: {
        legalName: "Acme",
        contactFirstName: "A",
        contactLastName: "B",
        email: "a@x.com",
        address: { street: "1 St", city: "Town", region: "VIC", postalCode: "3000" },
      },
    });
    expect(bodyOf(call()[1])).toMatchObject({ numberType: "local" });
  });

  const provisioningCompliance = {
    legalName: "Acme",
    contactFirstName: "A",
    contactLastName: "B",
    email: "a@x.com",
    address: { street: "1 St", city: "Town", region: "VIC", postalCode: "3000" },
  };

  it("telephony.startRun forwards chainComplementary when the caller opts out", async () => {
    // Annotated against the wrapper's own parameter type so `tsc` excess-property
    // checks the literal: if `chainComplementary` is dropped from the request-body
    // type again this stops compiling. That omission is what left every tenant with
    // two purchased numbers and two human-reviewed bundles, with no way to decline.
    const body: Parameters<typeof telephony.startRun>[0] = {
      tenantId: "t1",
      mode: "SUBACCOUNT",
      numberType: "mobile",
      chainComplementary: false,
      complianceInput: provisioningCompliance,
    };
    await telephony.startRun(body);
    const [url, init] = call();
    expect(url).toBe(`${BASE}/telephony/provisioning-runs`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toMatchObject({ chainComplementary: false });
  });

  it("telephony.startRun omits chainComplementary when the caller does not set it", async () => {
    // Absent (not `undefined`, not `true`) so the server-side `!== false` default
    // is what decides – the client must not hard-code the costly branch.
    await telephony.startRun({ tenantId: "t1", mode: "SUBACCOUNT", complianceInput: provisioningCompliance });
    expect(bodyOf(call()[1])).toEqual({
      tenantId: "t1",
      mode: "SUBACCOUNT",
      complianceInput: provisioningCompliance,
    });
  });

  it("emailProvisioning.startRun POSTs to /email-provisioning/runs", async () => {
    await emailProvisioning.startRun({
      tenantId: "t1",
      mode: "SUBUSER",
      kind: "UPRISE_SUBDOMAIN",
      fromLocalPart: "hello",
      fromName: "Hello",
    });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/email-provisioning/runs`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toMatchObject({ tenantId: "t1", kind: "UPRISE_SUBDOMAIN" });
  });

  it("emailProvisioning.revokeIdentity POSTs to the encoded revoke path", async () => {
    await emailProvisioning.revokeIdentity("id 3");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/email-provisioning/identities/id%203/revoke`);
    expect(init.method).toBe("POST");
  });
});

describe("transactionalCalls", () => {
  it("list builds the filter query (status joined, dates encoded) and GETs /calls", async () => {
    await transactionalCalls.list({
      status: ["COMPLETED", "FAILED"],
      contactId: "c1",
      search: "0400",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
      limit: 25,
      offset: 50,
    });
    expect(call()[0]).toBe(
      `${BASE}/calls?status=COMPLETED%2CFAILED&contactId=c1&search=0400&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&limit=25&offset=50`,
    );
  });

  it("list with no params GETs /calls without a query string", async () => {
    await transactionalCalls.list();
    expect(call()[0]).toBe(`${BASE}/calls`);
  });

  it("stats GETs /calls/stats with the same filter builder", async () => {
    await transactionalCalls.stats({ status: ["BUSY"] });
    expect(call()[0]).toBe(`${BASE}/calls/stats?status=BUSY`);
  });

  it("get encodes the call id into the path", async () => {
    await transactionalCalls.get("call/1");
    expect(call()[0]).toBe(`${BASE}/calls/call%2F1`);
  });

  it("recordingUrl builds an absolute proxy URL for an <audio> element", () => {
    expect(transactionalCalls.recordingUrl("call 2")).toBe(`${BASE}/calls/call%202/recording`);
  });

  it("voiceToken GETs the browser-voice access token endpoint", async () => {
    await transactionalCalls.voiceToken();
    expect(call()[0]).toBe(`${BASE}/calls/voice-token`);
  });

  it("initiate POSTs the call body to /calls", async () => {
    await transactionalCalls.initiate({ toNumber: "+61400000000", contactId: "c1" });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/calls`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ toNumber: "+61400000000", contactId: "c1" });
  });
});

describe("actionPages", () => {
  it("list builds the filter query string", async () => {
    await actionPages.list({ status: "PUBLISHED", search: "MP", limit: 10, offset: 20 });
    expect(call()[0]).toBe(`${BASE}/actions/pages?status=PUBLISHED&search=MP&limit=10&offset=20`);
  });

  it("get / results encode the id", async () => {
    await actionPages.get("p 1");
    expect(call(0)[0]).toBe(`${BASE}/actions/pages/p%201`);
    await actionPages.results("p 1", { limit: 5 });
    expect(call(1)[0]).toBe(`${BASE}/actions/pages/p%201/results?limit=5`);
  });

  it("create POSTs, update PATCHes", async () => {
    await actionPages.create({ title: "Ring your MP" });
    expect(call(0)[0]).toBe(`${BASE}/actions/pages`);
    expect(call(0)[1]?.method).toBe("POST");
    expect(bodyOf(call(0)[1])).toEqual({ title: "Ring your MP" });

    await actionPages.update("p1", { headline: "New headline" });
    expect(call(1)[0]).toBe(`${BASE}/actions/pages/p1`);
    expect(call(1)[1]?.method).toBe("PATCH");
  });

  it("lifecycle + preview-token POST to their sub-paths", async () => {
    await actionPages.publish("p1");
    expect(call(0)[0]).toBe(`${BASE}/actions/pages/p1/publish`);
    await actionPages.unpublish("p1");
    expect(call(1)[0]).toBe(`${BASE}/actions/pages/p1/unpublish`);
    await actionPages.archive("p1");
    expect(call(2)[0]).toBe(`${BASE}/actions/pages/p1/archive`);
    await actionPages.restore("p1");
    expect(call(3)[0]).toBe(`${BASE}/actions/pages/p1/restore`);
    await actionPages.previewToken("p1");
    expect(call(4)[0]).toBe(`${BASE}/actions/pages/p1/preview-token`);
    expect(call(4)[1]?.method).toBe("POST");
  });
});

describe("publicActions", () => {
  it("getPage hits the public path and carries the preview token", async () => {
    await publicActions.getPage("my slug");
    expect(call(0)[0]).toBe(`${BASE}/actions/public/pages/my%20slug`);
    await publicActions.getPage("s1", "tok en");
    expect(call(1)[0]).toBe(`${BASE}/actions/public/pages/s1?previewToken=tok%20en`);
  });

  it("createCallSession POSTs with the Turnstile header and never auto-redirects", async () => {
    await publicActions.createCallSession("s1", { supporter: { name: "Sam" } }, "ts-token");
    const [url, init] = call();
    expect(url).toBe(`${BASE}/actions/public/pages/s1/call-sessions`);
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({ supporter: { name: "Sam" } });
    expect((init.headers as Record<string, string>)["cf-turnstile-response"]).toBe("ts-token");
  });

  it("sessionEventsUrl builds an absolute SSE URL with the token encoded", () => {
    expect(publicActions.sessionEventsUrl("s 1", "t/k")).toBe(
      `${BASE}/actions/public/call-sessions/s%201/events?token=t%2Fk`,
    );
  });
});

describe("integrations (data sync)", () => {
  it("PATCHes a partial settings blob to the connection", async () => {
    await integrations.updateDataSyncSettings("conn 1", { push: { enabled: true } });
    const [url, init] = call();
    expect(url).toBe(`${BASE}/integrations/connections/conn%201/settings`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ push: { enabled: true } });
  });

  it("lists push deliveries with the filter query string", async () => {
    await integrations.listPushDeliveries({ connectionId: "c1", stream: "tag", status: "FAILED", limit: 25, offset: 50 });
    expect(call()[0]).toBe(
      `${BASE}/integrations/push-deliveries?connectionId=c1&stream=tag&status=FAILED&limit=25&offset=50`,
    );
  });

  it("omits the query entirely when unfiltered", async () => {
    await integrations.listPushDeliveries();
    expect(call()[0]).toBe(`${BASE}/integrations/push-deliveries`);
  });

  it("summary carries the window; retry POSTs the encoded id", async () => {
    await integrations.pushDeliverySummary(48);
    expect(call(0)[0]).toBe(`${BASE}/integrations/push-deliveries/summary?sinceHours=48`);
    await integrations.retryPushDelivery("d 1");
    const [url, init] = call(1);
    expect(url).toBe(`${BASE}/integrations/push-deliveries/d%201/retry`);
    expect(init.method).toBe("POST");
  });
});
