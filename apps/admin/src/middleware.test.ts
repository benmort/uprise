import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

/**
 * The middleware is this app's SSO gate and the only place the `/embed/*` framing policy is
 * set. Both decisions are host-dependent, and both fail in ways nothing else catches: the
 * wrong auth origin is a redirect LOOP rather than an error page, and a wrong
 * `frame-ancestors` is a blank iframe with the reason buried in a browser console.
 *
 * These build a minimal NextRequest-shaped stub (only the accessors the middleware reads)
 * and assert on the real NextResponse returned. Harness mirrors apps/field.
 */

type ReqShape = {
  hasCookie?: boolean;
  headers?: Record<string, string>;
  nextUrl?: { host?: string; protocol?: string; pathname?: string; search?: string };
};

function makeReq({ hasCookie = false, headers = {}, nextUrl = {} }: ReqShape): NextRequest {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    cookies: {
      get: (name: string) => (hasCookie ? { name, value: "session-value" } : undefined),
    },
    headers: {
      get: (key: string) => lower[key.toLowerCase()] ?? null,
    },
    nextUrl: {
      host: nextUrl.host ?? "localhost:3000",
      protocol: nextUrl.protocol ?? "http:",
      pathname: nextUrl.pathname ?? "/",
      search: nextUrl.search ?? "",
    },
  } as unknown as NextRequest;
}

/** The redirect target of an unauthenticated request from `host`. */
function bounceFrom(host: string, proto = "https"): URL {
  const res = middleware(
    makeReq({ headers: { host, "x-forwarded-proto": proto }, nextUrl: { pathname: "/dashboard" } }),
  );
  const location = res.headers.get("location");
  if (location === null) throw new Error(`no redirect from ${host}`);
  return new URL(location);
}

/** The `frame-ancestors` sources set for an /embed/* request from `host`. */
function frameAncestorsFrom(host: string): string[] {
  const res = middleware(makeReq({ headers: { host }, nextUrl: { pathname: "/embed/abc" } }));
  const csp = res.headers.get("content-security-policy");
  if (csp === null) throw new Error(`no CSP for ${host}`);
  return csp.replace("frame-ancestors ", "").split(" ");
}

const ORIGINAL_AUTH_URL = process.env.NEXT_PUBLIC_AUTH_APP_URL;

beforeEach(() => {
  // The platform value, as production configures it — so a derivation showing up is visible
  // as a DIFFERENT origin rather than as the absence of a default.
  process.env.NEXT_PUBLIC_AUTH_APP_URL = "https://auth.uprise.org.au";
});

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) delete process.env.NEXT_PUBLIC_AUTH_APP_URL;
  else process.env.NEXT_PUBLIC_AUTH_APP_URL = ORIGINAL_AUTH_URL;
});

describe("middleware — SSO gate", () => {
  it("passes the request through when the session cookie is present", () => {
    const res = middleware(makeReq({ hasCookie: true }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects an unauthenticated request to the auth app /sign-in with return_to", () => {
    const url = bounceFrom("admin.uprise.org.au");
    expect(url.origin).toBe("https://auth.uprise.org.au");
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("return_to")).toBe("https://admin.uprise.org.au/dashboard");
  });

  it("builds return_to from the forwarded host, not the internal upstream", () => {
    const res = middleware(
      makeReq({
        headers: {
          "x-forwarded-host": "admin.example.org",
          "x-forwarded-proto": "https",
          host: "localhost:3000",
        },
        nextUrl: { host: "localhost:3000", protocol: "http:", pathname: "/x", search: "?a=1" },
      }),
    );
    const url = new URL(res.headers.get("location") as string);
    expect(url.searchParams.get("return_to")).toBe("https://admin.example.org/x?a=1");
  });

  it("takes the first entry from comma-joined forwarded header lists", () => {
    const res = middleware(
      makeReq({
        headers: {
          "x-forwarded-host": "admin.public.example.org, edge.internal",
          "x-forwarded-proto": "https, http",
        },
        nextUrl: { pathname: "/" },
      }),
    );
    const url = new URL(res.headers.get("location") as string);
    expect(url.searchParams.get("return_to")).toBe("https://admin.public.example.org/");
  });

  it("exempts the unauthenticated public routes from the gate entirely", () => {
    for (const pathname of ["/p/poll-1", "/e/event-1"]) {
      const res = middleware(makeReq({ nextUrl: { pathname } }));
      expect(res.headers.get("x-middleware-next"), pathname).toBe("1");
      expect(res.headers.get("location"), pathname).toBeNull();
    }
  });
});

describe("middleware — auth origin on a tenant's own domain", () => {
  /**
   * THE white-label login loop. Bouncing to the platform auth host sets the session on
   * `.uprise.org.au`; the visitor returns to `admin.<tenant>` where that cookie cannot be
   * read, and the gate bounces them straight back out. Deriving the sibling keeps the
   * cookie on a parent both hosts share.
   */
  it("derives auth.<tenant parent> instead of the configured platform host", () => {
    const url = bounceFrom("admin.commonthreads.org.au");
    expect(url.origin).toBe("https://auth.commonthreads.org.au");
    expect(url.pathname).toBe("/sign-in");
    // …and the return_to still points back at the tenant host, so the round trip closes.
    expect(url.searchParams.get("return_to")).toBe("https://admin.commonthreads.org.au/dashboard");
  });

  it("carries the request protocol into the derived origin", () => {
    expect(bounceFrom("admin.commonthreads.org.au", "http").origin).toBe(
      "http://auth.commonthreads.org.au",
    );
  });

  /**
   * The regression guard. Every host that exists today must fall through to the configured
   * value untouched — including the shapes that defeated an earlier version of the gate
   * (trailing-dot FQDNs, upriselabs.org, deeper subdomains of a domain we own).
   */
  it("leaves the configured auth origin untouched on every host that exists today", () => {
    for (const host of [
      "admin.uprise.org.au",
      "admin.dev.uprise.org.au",
      "common-threads.uprise.org.au",
      "uprise.org.au",
      "uprise-admin-prog-network.vercel.app",
      "admin.uprise.org.au.",
      "www.upriselabs.org",
      "admin.staging.uprise.org.au",
    ]) {
      expect(bounceFrom(host).origin, host).toBe("https://auth.uprise.org.au");
    }
  });

  it("falls through on local and ported dev hosts, where a sibling is not derivable", () => {
    // The dev hosts carry per-app ports a hostname-only derivation cannot recover, so the
    // explicit env URL is the only thing that addresses the right port.
    for (const host of ["localhost:3000", "admin.lvh.me:3000", "127.0.0.1:3000"]) {
      expect(bounceFrom(host, "http").origin, host).toBe("https://auth.uprise.org.au");
    }
  });
});

describe("middleware — /embed/* frame-ancestors", () => {
  it("allows self and the platform on a platform host", () => {
    const sources = frameAncestorsFrom("admin.uprise.org.au");
    expect(sources).toContain("'self'");
    expect(sources).toContain("https://*.uprise.org.au");
  });

  /**
   * On a tenant's own domain the framing action app is `action.<tenant>`, which matches
   * nothing under `*.uprise.org.au` — so without the tenant's parent the embed renders
   * blank for exactly the tenants who paid for a custom domain.
   */
  it("adds the tenant's parent so their own action app can frame the embed", () => {
    const sources = frameAncestorsFrom("admin.commonthreads.org.au");
    expect(sources).toContain("https://*.commonthreads.org.au");
    // The platform stays allowed — a tenant host does not replace the platform entry.
    expect(sources).toContain("https://*.uprise.org.au");
  });

  /**
   * Ride-along security fix: these two were sent unconditionally, which told every
   * production visitor's browser to accept framing by software on their own machine.
   */
  it("sends the localhost origins only on a dev host", () => {
    for (const host of ["localhost:3000", "admin.lvh.me:3000"]) {
      expect(frameAncestorsFrom(host), host).toContain("http://localhost:3004");
    }
    for (const host of [
      "admin.uprise.org.au",
      "admin.commonthreads.org.au",
      "uprise-admin-prog-network.vercel.app",
      "admin.uprise.org.au.",
    ]) {
      const sources = frameAncestorsFrom(host);
      expect(sources, host).not.toContain("http://localhost:3004");
      expect(sources, host).not.toContain("http://localhost:3003");
    }
  });

  it("never emits an empty or wildcard-everything policy", () => {
    for (const host of ["admin.uprise.org.au", "admin.commonthreads.org.au", "localhost:3000", ""]) {
      const sources = frameAncestorsFrom(host);
      expect(sources.length, host).toBeGreaterThan(1);
      expect(sources, host).not.toContain("*");
    }
  });
});

/**
 * The matcher is the other half of the gate: the middleware never runs for a path it
 * excludes, so the exemptions need asserting rather than assuming.
 */
describe("config.matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);
  const gated = (path: string) => pattern.test(path);

  it("gates the organiser screens", () => {
    for (const path of ["/", "/dashboard", "/settings/domains", "/contacts/abc"]) {
      expect(gated(path), `${path} should be gated`).toBe(true);
    }
  });

  it("exempts Next internals, the service worker and static assets", () => {
    for (const path of [
      "/_next/static/chunk.js",
      "/manifest.webmanifest",
      "/sw.js",
      "/favicon.ico",
      "/images/logo.png",
      "/styles.css",
    ]) {
      expect(gated(path), `${path} should be exempt`).toBe(false);
    }
  });
});
