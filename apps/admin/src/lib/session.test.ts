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
    await expect(getSessionOutcome()).resolves.toEqual({ user: { id: "u1" }, deniedWorkspace: false });
  });

  it("flags deniedWorkspace on a 403 (valid session, not a member of this host's tenant)", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "nope", status: 403 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: true });
  });

  it("does not flag deniedWorkspace for a 401 / other failure (→ login bounce)", async () => {
    checkSession.mockResolvedValue({ ok: false, error: "nope", status: 401 } as any);
    await expect(getSessionOutcome()).resolves.toEqual({ user: null, deniedWorkspace: false });
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
