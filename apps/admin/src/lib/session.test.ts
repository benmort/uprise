import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({
  auth: { checkSession: vi.fn(), logout: vi.fn() },
  getAuthAppUrl: vi.fn(() => "https://auth.uprise.org.au"),
}));

import { auth } from "@uprise/api-client";
import { getSession, getSessionOutcome } from "./session";

const checkSession = vi.mocked(auth.checkSession);

beforeEach(() => vi.clearAllMocks());

describe("getSessionOutcome", () => {
  it("returns the principal on a successful check", async () => {
    checkSession.mockResolvedValue({ ok: true, data: { user: { id: "u1" } } } as any);
    await expect(getSessionOutcome()).resolves.toEqual({
      user: { id: "u1" },
      deniedWorkspace: false,
      unreachable: false,
    });
  });

  it("flags deniedWorkspace on a 403 (valid session, not a member of this host's tenant)", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "nope", status: 403 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: true, unreachable: false });
  });

  it("treats a 401 as signed out – the only verdict that means no session", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "nope", status: 401 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false, unreachable: false });
  });

  it("reports a rejected fetch (no status) as unreachable, NOT signed out", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "Failed to fetch" } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false, unreachable: true });
  });

  it("prefers an explicit networkError flag when the client sets one", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "Failed to fetch", networkError: true } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false, unreachable: true });
  });

  it("reports a 500 as unreachable, NOT signed out", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "boom", status: 500 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false, unreachable: true });
  });

  it("reports an edge 502 as unreachable, NOT signed out", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "Bad Gateway", status: 502 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false, unreachable: true });
  });

  // 500 is the boundary of "the server failed on its own account". 499 and below is the server
  // answering about the request, which says nothing about whether we can reach it.
  it.each([500, 503, 504])("reports %i as unreachable", async (status) => {
    checkSession.mockResolvedValue({ ok: false, error: "server", status } as any);
    await expect(getSessionOutcome()).resolves.toMatchObject({ unreachable: true });
  });

  // The point of the flag is that it means something. A 400/404/429 is a reply from a server
  // we plainly reached, so calling it "unreachable" would degrade it to "not 401/403".
  it.each([400, 404, 429, 499])("does NOT report %i as unreachable – the server answered", async (status) => {
    checkSession.mockResolvedValue({ ok: false, error: "nope", status } as any);
    await expect(getSessionOutcome()).resolves.toEqual({
      user: null,
      deniedWorkspace: false,
      unreachable: false,
    });
  });

  // A networkError flag outranks any status the client may also have attached: a rejected
  // fetch is a rejected fetch.
  it("treats an explicit networkError as unreachable even alongside a 4xx status", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "blocked", status: 400, networkError: true } as any);
    await expect(getSessionOutcome()).resolves.toMatchObject({ unreachable: true });
  });

  // 401/403 are the only two verdicts about the session itself, and neither is a reachability
  // problem – guards the classification from both directions.
  it("never marks a 401 or 403 unreachable", async () => {
    for (const status of [401, 403]) {
      checkSession.mockResolvedValue({ ok: false, error: "nope", status } as any);
      await expect(getSessionOutcome()).resolves.toMatchObject({ unreachable: false });
    }
  });
});

describe("getSession", () => {
  it("returns the user or null", async () => {
    checkSession.mockResolvedValueOnce({ ok: true, data: { user: { id: "u2" } } } as any);
    await expect(getSession()).resolves.toEqual({ id: "u2" });
    checkSession.mockResolvedValueOnce({ ok: false, error: "x" } as any);
    await expect(getSession()).resolves.toBeNull();
  });
});
