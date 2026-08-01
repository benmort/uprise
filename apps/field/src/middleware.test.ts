import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

/**
 * The middleware is the app's SSO gate: pass through when the session cookie is
 * present, otherwise 307-redirect to the auth app's /volunteer entry carrying a
 * return_to rebuilt from the *forwarded* host/proto (so a canvasser behind a
 * proxy lands back on the public URL, not the internal upstream).
 *
 * These construct a minimal NextRequest-shaped stub (only the accessors the
 * middleware reads) and assert on the real NextResponse it returns.
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
      host: nextUrl.host ?? "localhost:3005",
      protocol: nextUrl.protocol ?? "http:",
      pathname: nextUrl.pathname ?? "/",
      search: nextUrl.search ?? "",
    },
  } as unknown as NextRequest;
}

/** Pull the decoded return_to param out of a redirect Location header. */
function returnTo(location: string): string {
  const url = new URL(location);
  const rt = url.searchParams.get("return_to");
  if (rt === null) throw new Error(`no return_to in ${location}`);
  return rt;
}

const ORIGINAL_AUTH_URL = process.env.NEXT_PUBLIC_AUTH_APP_URL;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_APP_URL;
});

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) delete process.env.NEXT_PUBLIC_AUTH_APP_URL;
  else process.env.NEXT_PUBLIC_AUTH_APP_URL = ORIGINAL_AUTH_URL;
});

describe("middleware", () => {
  it("passes the request through when the session cookie is present", () => {
    const res = middleware(makeReq({ hasCookie: true }));
    // NextResponse.next() marks the response for the next handler and never redirects.
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated requests to the auth app /volunteer entry", () => {
    const res = middleware(makeReq({ hasCookie: false }));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(location as string);
    expect(url.origin).toBe("http://localhost:3002"); // default auth app
    expect(url.pathname).toBe("/volunteer");
    expect(url.searchParams.has("return_to")).toBe(true);
  });

  it("builds return_to from forwarded host and proto, not the internal upstream", () => {
    const res = middleware(
      makeReq({
        headers: {
          "x-forwarded-host": "canvass.example.org",
          "x-forwarded-proto": "https",
          host: "localhost:3005",
        },
        nextUrl: { host: "localhost:3005", protocol: "http:", pathname: "/get-turf" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe(
      "https://canvass.example.org/get-turf",
    );
  });

  it("preserves the original path and query in return_to", () => {
    const res = middleware(
      makeReq({
        headers: { host: "canvass.example.org", "x-forwarded-proto": "https" },
        nextUrl: { pathname: "/abc123", search: "?door=7" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe(
      "https://canvass.example.org/abc123?door=7",
    );
  });

  it("falls back to the Host header when no x-forwarded-host is set", () => {
    const res = middleware(
      makeReq({
        headers: { host: "app.internal:8080" },
        nextUrl: { host: "localhost:3005", protocol: "http:", pathname: "/" },
      }),
    );
    // No forwarded proto → derives from nextUrl.protocol ("http:") stripped of the colon.
    expect(returnTo(res.headers.get("location") as string)).toBe("http://app.internal:8080/");
  });

  it("falls back to nextUrl host/proto when no host headers are present at all", () => {
    const res = middleware(
      makeReq({ nextUrl: { host: "localhost:3005", protocol: "https:", pathname: "/" } }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe("https://localhost:3005/");
  });

  it("takes the first entry from comma-joined forwarded header lists", () => {
    // A proxy chain can join values: only the client-facing first hop is public.
    const res = middleware(
      makeReq({
        headers: {
          "x-forwarded-host": "public.example.org, edge.internal",
          "x-forwarded-proto": "https, http",
        },
        nextUrl: { pathname: "/" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe("https://public.example.org/");
  });

  it("honours a configured NEXT_PUBLIC_AUTH_APP_URL", () => {
    process.env.NEXT_PUBLIC_AUTH_APP_URL = "https://auth.uprise.org.au";
    const res = middleware(makeReq({ hasCookie: false }));
    const url = new URL(res.headers.get("location") as string);
    expect(url.origin).toBe("https://auth.uprise.org.au");
    expect(url.pathname).toBe("/volunteer");
  });
});

/**
 * The white-label login loop. Bouncing a canvasser on `field.<tenant>` to the platform auth
 * host sets the session on `.uprise.org.au`; they return to `field.<tenant>`, where that
 * cookie cannot be read, and this gate bounces them out again — a loop, not an error page.
 */
describe("middleware — auth origin on a tenant's own domain", () => {
  /** The redirect target of an unauthenticated request from `host`. */
  function bounceFrom(host: string, proto = "https"): URL {
    const res = middleware(
      makeReq({ headers: { host, "x-forwarded-proto": proto }, nextUrl: { pathname: "/get-turf" } }),
    );
    return new URL(res.headers.get("location") as string);
  }

  beforeEach(() => {
    // The platform value as production configures it, so a derivation is visible as a
    // different origin rather than as the absence of a default.
    process.env.NEXT_PUBLIC_AUTH_APP_URL = "https://auth.uprise.org.au";
  });

  it("derives auth.<tenant parent> and keeps the volunteer entry", () => {
    const url = bounceFrom("field.commonthreads.org.au");
    expect(url.origin).toBe("https://auth.commonthreads.org.au");
    expect(url.pathname).toBe("/volunteer");
    // The round trip has to close on the tenant host, or the derivation bought nothing.
    expect(url.searchParams.get("return_to")).toBe("https://field.commonthreads.org.au/get-turf");
  });

  it("carries the request protocol into the derived origin", () => {
    expect(bounceFrom("field.commonthreads.org.au", "http").origin).toBe(
      "http://auth.commonthreads.org.au",
    );
  });

  /**
   * Regression guard, including the shapes that defeated an earlier version of the gate:
   * trailing-dot FQDNs, upriselabs.org, and deeper subdomains of a domain we own.
   */
  it("leaves the configured auth origin untouched on every host that exists today", () => {
    for (const host of [
      "field.uprise.org.au",
      "field.dev.uprise.org.au",
      "uprise.org.au",
      "uprise-field-prog-network.vercel.app",
      "field.uprise.org.au.",
      "www.upriselabs.org",
      "field.staging.uprise.org.au",
    ]) {
      expect(bounceFrom(host).origin, host).toBe("https://auth.uprise.org.au");
    }
  });

  it("falls through on local and ported dev hosts, where a sibling is not derivable", () => {
    for (const host of ["localhost:3005", "field.lvh.me:3005", "127.0.0.1:3005"]) {
      expect(bounceFrom(host, "http").origin, host).toBe("https://auth.uprise.org.au");
    }
  });
});

/**
 * The matcher is the other half of the gate: the middleware above never runs for a path the
 * matcher excludes. That's how `/demo` (the public read-only walk view the marketing site embeds)
 * stays reachable without a session — so it needs asserting, not assuming.
 */
describe("config.matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);
  /** True when the middleware WOULD run for this path (i.e. the path is gated). */
  const gated = (path: string) => pattern.test(path);

  it("exempts the public demo view and anything under it", () => {
    expect(gated("/demo")).toBe(false);
    expect(gated("/demo/glebe")).toBe(false);
  });

  it("still gates a path that merely starts with the word demo", () => {
    expect(gated("/demolition")).toBe(true);
  });

  it("gates the volunteer screens", () => {
    for (const path of ["/", "/shifts", "/get-turf", "/me", "/texts", "/abc123/door/xyz"]) {
      expect(gated(path), `${path} should be gated`).toBe(true);
    }
  });

  it("exempts the service worker, static assets and the keep-warm cron", () => {
    for (const path of ["/sw.js", "/manifest.webmanifest", "/icons/icon.png", "/api/warm"]) {
      expect(gated(path), `${path} should be exempt`).toBe(false);
    }
  });
});
