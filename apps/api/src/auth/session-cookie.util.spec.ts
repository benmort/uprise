import type { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { SESSION_COOKIE, clearSessionCookie, sessionCookieOptions } from "./session-cookie.util";

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, fallback?: string) => (values[key] !== undefined ? values[key] : (fallback ?? "")),
  } as unknown as ConfigService;
}

// The cookie contract is load-bearing for cross-subdomain SSO (meld doc 14): a
// missing Domain attribute mints a host-only cookie that the sibling apps can't
// see, which redirect-loops. These lock that contract.
describe("sessionCookieOptions", () => {
  it("scopes the cookie to the parent domain and forces Secure when SESSION_COOKIE_DOMAIN is set", () => {
    const opts = sessionCookieOptions(
      fakeConfig({ SESSION_COOKIE_DOMAIN: ".dev.uprise.org.au", NODE_ENV: "development" }),
    );
    expect(opts).toMatchObject({
      domain: ".dev.uprise.org.au",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("is host-only and non-Secure outside production when the domain is empty", () => {
    const opts = sessionCookieOptions(fakeConfig({ SESSION_COOKIE_DOMAIN: "", NODE_ENV: "development" }));
    expect(opts.domain).toBeUndefined();
    expect(opts.secure).toBe(false);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("is Secure in production even without a cookie domain", () => {
    const opts = sessionCookieOptions(fakeConfig({ SESSION_COOKIE_DOMAIN: "", NODE_ENV: "production" }));
    expect(opts.domain).toBeUndefined();
    expect(opts.secure).toBe(true);
  });

  it("treats a whitespace-only domain as empty (host-only)", () => {
    const opts = sessionCookieOptions(fakeConfig({ SESSION_COOKIE_DOMAIN: "   ", NODE_ENV: "development" }));
    expect(opts.domain).toBeUndefined();
    expect(opts.secure).toBe(false);
  });

  it("passes the expiry through when given", () => {
    const expires = new Date("2030-01-01T00:00:00.000Z");
    const opts = sessionCookieOptions(fakeConfig({ SESSION_COOKIE_DOMAIN: ".dev.uprise.org.au" }), expires);
    expect(opts.expires).toBe(expires);
  });
});

describe("clearSessionCookie", () => {
  it("clears both the parent-domain and the host-only cookie when a domain is configured", () => {
    const clearCookie = jest.fn();
    const res = { clearCookie } as unknown as Response;
    clearSessionCookie(res, fakeConfig({ SESSION_COOKIE_DOMAIN: ".dev.uprise.org.au" }));
    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/", domain: ".dev.uprise.org.au" });
    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/" });
    expect(clearCookie).toHaveBeenCalledTimes(2);
  });

  it("clears only the host-only cookie when no domain is configured", () => {
    const clearCookie = jest.fn();
    const res = { clearCookie } as unknown as Response;
    clearSessionCookie(res, fakeConfig({ SESSION_COOKIE_DOMAIN: "" }));
    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: "/" });
    expect(clearCookie).toHaveBeenCalledTimes(1);
  });
});
