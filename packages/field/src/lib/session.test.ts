import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api-client transport so session helpers can be exercised in isolation.
vi.mock("@uprise/api-client", () => ({
  auth: {
    checkSession: vi.fn(async () => ({ ok: true, data: { user: null } })),
    logout: vi.fn(async () => ({ ok: true, data: {} })),
  },
  // The shared builder is exercised in api-client's own tests; here we just assert goToLogin
  // hands it the current URL and navigates to the result.
  loginRedirectUrl: (returnTo: string) => `http://auth.test/login?return_to=${encodeURIComponent(returnTo)}`,
}));

import { auth } from "@uprise/api-client";
import { getSession, goToLogin, logout, probeSession } from "./session";

const mockCheck = auth.checkSession as unknown as ReturnType<typeof vi.fn>;
const mockLogout = auth.logout as unknown as ReturnType<typeof vi.fn>;

describe("getSession", () => {
  beforeEach(() => {
    mockCheck.mockClear();
  });

  it("returns the principal when the session check is ok", async () => {
    const user = { id: "u1", email: "a@b.co" };
    mockCheck.mockResolvedValueOnce({ ok: true, data: { user } });
    expect(await getSession()).toBe(user);
  });

  it("returns null when the session check fails", async () => {
    mockCheck.mockResolvedValueOnce({ ok: false, error: "unauthorised", status: 401 });
    expect(await getSession()).toBeNull();
  });
});

describe("probeSession", () => {
  beforeEach(() => {
    mockCheck.mockClear();
  });

  it("reports authed with the principal", async () => {
    const user = { id: "u1", email: "a@b.co" };
    mockCheck.mockResolvedValueOnce({ ok: true, data: { user } });
    expect(await probeSession()).toEqual({ state: "authed", user });
  });

  it("reports signed-out when the API answers ok with no user", async () => {
    mockCheck.mockResolvedValueOnce({ ok: true, data: { user: null } });
    expect(await probeSession()).toEqual({ state: "signed-out" });
  });

  it("reports signed-out on a definitive 401/403", async () => {
    mockCheck.mockResolvedValueOnce({ ok: false, error: "unauthorised", status: 401 });
    expect(await probeSession()).toEqual({ state: "signed-out" });
    mockCheck.mockResolvedValueOnce({ ok: false, error: "forbidden", status: 403 });
    expect(await probeSession()).toEqual({ state: "signed-out" });
  });

  it("reports unreachable — NOT signed-out — on a network failure or 5xx", async () => {
    mockCheck.mockResolvedValueOnce({ ok: false, error: "fetch failed", status: 0 });
    expect(await probeSession()).toEqual({ state: "unreachable", error: "fetch failed" });
    mockCheck.mockResolvedValueOnce({ ok: false, error: "bad gateway", status: 502 });
    expect(await probeSession()).toEqual({ state: "unreachable", error: "bad gateway" });
  });
});

describe("goToLogin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when there is no window (SSR)", () => {
    // Node env: window is already undefined, so this must simply return.
    expect(() => goToLogin()).not.toThrow();
  });

  it("bounces to the login URL preserving the current URL", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { href: "https://field.test/turf?x=1", assign } });
    goToLogin();
    expect(assign).toHaveBeenCalledWith(
      "http://auth.test/login?return_to=" + encodeURIComponent("https://field.test/turf?x=1"),
    );
  });
});

describe("logout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the session then bounces to login", async () => {
    mockLogout.mockClear();
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { href: "https://field.test/", assign } });
    await logout();
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("http://auth.test/login?return_to=" + encodeURIComponent("https://field.test/"));
  });
});
