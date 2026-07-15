import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  getApiUrl,
  getAuthAppUrl,
  getActionAppUrl,
  request,
  auth,
  profile,
  orgProfile,
  sessions,
  tenants,
  marketing,
  plans,
  telephony,
  transactionalCalls,
  emailProvisioning,
  tenantLogoUrl,
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

  it("catches a network/throw and returns the error without a status", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request("/down");
    expect(res).toEqual({ ok: false, error: "connection refused" });
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

  it("logout DELETEs /iam/sessions", async () => {
    await auth.logout();
    const [url, init] = call();
    expect(url).toBe(`${BASE}/iam/sessions`);
    expect(init.method).toBe("DELETE");
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
});

describe("telephony + email provisioning", () => {
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
