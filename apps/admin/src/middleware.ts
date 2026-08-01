import { NextRequest, NextResponse } from "next/server";
import { isCustomParentHost, isDerivableHost, parentDomain, siblingOrigin } from "@uprise/domains";

/**
 * SSO gate (meld doc 14). With no session cookie, bounce to the standalone auth
 * app carrying return_to so the user lands back here after signing in. The cookie
 * is the parent-domain httpOnly session (SESSION_COOKIE_DOMAIN); in local dev use
 * shared *.lvh.me hosts so it's visible to this app. Layouts still resolve the
 * principal from /auth/check for role routing + a present-but-stale cookie.
 */
const COOKIE = "auth_token";

/**
 * The host and protocol this request arrived on PUBLICLY. Behind a proxy or tunnel
 * (ngrok dev, Vercel) `req.nextUrl` reflects the internal upstream (e.g. localhost:3000),
 * so everything user-facing — the return_to, the auth app's origin, the frame-ancestors
 * list — must be rebuilt from the forwarded host/proto or we address the upstream.
 */
function publicOrigin(req: NextRequest): { host: string; proto: string } {
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const host = (fwdHost ?? req.nextUrl.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, ""))
    .split(",")[0]
    .trim();
  return { host, proto };
}

/** This app's public URL for the current request, used as the sign-in `return_to`. */
function publicHref(req: NextRequest): string {
  const { host, proto } = publicOrigin(req);
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

/**
 * Where to send an unauthenticated visitor to sign in.
 *
 * On a tenant's own domain the configured platform auth host is not merely suboptimal, it
 * is a redirect loop: `auth.uprise.org.au` mints the session on `.uprise.org.au`, the
 * visitor returns to `admin.<tenant>`, the cookie is not readable from that parent, and
 * this middleware bounces them straight back out. Deriving `auth.<the same parent>` keeps
 * the cookie on a parent both hosts share, which is the whole point of the flat host layout.
 *
 * Every other host — platform, preview deploy, dev port — falls through to the configured
 * value untouched. `isCustomParentHost` is a useful default rather than a safety boundary,
 * so `siblingOrigin` returning null (dev/ported hosts) also falls through.
 */
function authAppOrigin(host: string, proto: string): string {
  if (isCustomParentHost(host)) {
    const derived = siblingOrigin(host, "auth", proto);
    if (derived) return derived;
  }
  return process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
}

/**
 * Who may iframe `/embed/*`. The action app frames these, and on a tenant's own domain
 * that action app is `action.<tenant>` rather than anything under `*.uprise.org.au`, so
 * the tenant's parent has to be allowed explicitly or the embed renders blank for exactly
 * the tenants who paid for their own domain. Allowed as a wildcard on the parent, matching
 * the shape of the platform entry beside it — the route serves public data only, and a
 * tenant embedding it on their own apex is a reasonable thing to want.
 *
 * The two localhost origins are dev-only and used to be sent in production unconditionally,
 * which told every visitor's browser to accept framing by software on their own machine.
 * `isDerivableHost` is false exactly for local and ported hosts, i.e. dev.
 */
function frameAncestors(host: string): string {
  const sources = ["'self'", "https://*.uprise.org.au"];
  if (isCustomParentHost(host)) {
    const parent = parentDomain(host);
    if (parent) sources.push(`https://*.${parent}`);
  }
  if (!isDerivableHost(host)) sources.push("http://localhost:3004", "http://localhost:3003");
  return sources.join(" ");
}

export function middleware(req: NextRequest): NextResponse {
  // Public poll viewer (/p/*) — chrome-less, unauthenticated; the action app rewrites onto it.
  if (req.nextUrl.pathname.startsWith("/p/")) return NextResponse.next();
  // Public event RSVP (/e/*) — chrome-less, unauthenticated; gated per-event by
  // publicRsvpEnabled in the API. Supporters register without a session.
  if (req.nextUrl.pathname.startsWith("/e/")) return NextResponse.next();
  // Embeddable insights viz (/embed/*) — unauthenticated (public data only) AND frameable, so the
  // action app can iframe it into its own layout. Scope who may frame it to uprise sites.
  if (req.nextUrl.pathname.startsWith("/embed/")) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors(publicOrigin(req).host)}`);
    return res;
  }
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const { host, proto } = publicOrigin(req);
  const url = new URL("/sign-in", authAppOrigin(host, proto));
  url.searchParams.set("return_to", publicHref(req));
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals, the PWA service-worker assets, and
  // static files (so the login bounce never blocks JS/CSS/icons).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-|worker-|fallback-|images/|icons/|.*\\.(?:png|jpg|jpeg|svg|gif|ico|json|js|css|woff2?)).*)",
  ],
};
