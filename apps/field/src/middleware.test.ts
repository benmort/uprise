import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { middleware } from "./middleware";

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
      pathname: nextUrl.pathname ?? "/field",
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
        nextUrl: { host: "localhost:3005", protocol: "http:", pathname: "/field/get-turf" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe(
      "https://canvass.example.org/field/get-turf",
    );
  });

  it("preserves the original path and query in return_to", () => {
    const res = middleware(
      makeReq({
        headers: { host: "canvass.example.org", "x-forwarded-proto": "https" },
        nextUrl: { pathname: "/field/abc123", search: "?door=7" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe(
      "https://canvass.example.org/field/abc123?door=7",
    );
  });

  it("falls back to the Host header when no x-forwarded-host is set", () => {
    const res = middleware(
      makeReq({
        headers: { host: "app.internal:8080" },
        nextUrl: { host: "localhost:3005", protocol: "http:", pathname: "/field" },
      }),
    );
    // No forwarded proto → derives from nextUrl.protocol ("http:") stripped of the colon.
    expect(returnTo(res.headers.get("location") as string)).toBe("http://app.internal:8080/field");
  });

  it("falls back to nextUrl host/proto when no host headers are present at all", () => {
    const res = middleware(
      makeReq({ nextUrl: { host: "localhost:3005", protocol: "https:", pathname: "/field" } }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe("https://localhost:3005/field");
  });

  it("takes the first entry from comma-joined forwarded header lists", () => {
    // A proxy chain can join values: only the client-facing first hop is public.
    const res = middleware(
      makeReq({
        headers: {
          "x-forwarded-host": "public.example.org, edge.internal",
          "x-forwarded-proto": "https, http",
        },
        nextUrl: { pathname: "/field" },
      }),
    );
    expect(returnTo(res.headers.get("location") as string)).toBe("https://public.example.org/field");
  });

  it("honours a configured NEXT_PUBLIC_AUTH_APP_URL", () => {
    process.env.NEXT_PUBLIC_AUTH_APP_URL = "https://auth.uprise.org.au";
    const res = middleware(makeReq({ hasCookie: false }));
    const url = new URL(res.headers.get("location") as string);
    expect(url.origin).toBe("https://auth.uprise.org.au");
    expect(url.pathname).toBe("/volunteer");
  });
});
