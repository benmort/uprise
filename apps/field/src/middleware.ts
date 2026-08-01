import { NextRequest, NextResponse } from "next/server";
import { isCustomParentHost, siblingOrigin } from "@uprise/domains";

/**
 * SSO gate (meld doc 14). With no session cookie, bounce to the standalone auth
 * app carrying return_to so the canvasser lands back here after signing in. The
 * cookie is the parent-domain httpOnly session (SESSION_COOKIE_DOMAIN). Screens
 * still resolve the principal from /auth/check for the volunteer id + role.
 */
const COOKIE = "auth_token";

/**
 * The host and protocol this request arrived on PUBLICLY. Behind a proxy/tunnel (ngrok dev,
 * Vercel) `req.nextUrl` reflects the internal upstream (e.g. localhost:3005), so both the
 * return_to and the auth app's origin must be rebuilt from the forwarded host/proto —
 * otherwise the canvasser is sent to localhost after signing in.
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
 * Where to send an unauthenticated canvasser to sign in.
 *
 * On a tenant's own domain the configured platform auth host is a redirect loop, not just
 * the wrong branding: `auth.uprise.org.au` mints the session on `.uprise.org.au`, the
 * canvasser returns to `field.<tenant>`, the cookie is not readable from that parent, and
 * this middleware bounces them out again. Deriving `auth.<the same parent>` keeps the
 * cookie on a parent both hosts share.
 *
 * Every other host — platform, preview deploy, dev port — falls through to the configured
 * value untouched, including when `siblingOrigin` declines (local and ported hosts).
 */
function authAppOrigin(host: string, proto: string): string {
  if (isCustomParentHost(host)) {
    const derived = siblingOrigin(host, "auth", proto);
    if (derived) return derived;
  }
  return process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
}

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const { host, proto } = publicOrigin(req);
  // Volunteers get the mobile, phone-first volunteer entry — not the organiser /sign-in.
  // `/volunteer` boards the open campaigns and links on to sign-in for returning
  // canvassers; both carry the `return_to` below, so either path lands back here.
  const url = new URL("/volunteer", authAppOrigin(host, proto));
  url.searchParams.set("return_to", publicHref(req));
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals, the PWA service-worker assets, static
  // files (so the login bounce never blocks JS/CSS/icons), the keep-warm cron
  // target (unauthenticated by design — must reach the lambda, not bounce at the edge)
  // and `/demo` (the public, read-only walk view the marketing site embeds — it renders
  // fixtures and calls no API, see app/demo/page.tsx). `demo(?:$|/)` so a future
  // `/demolition` route would still be gated.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-|worker-|fallback-|images/|icons/|api/warm|demo(?:$|/)|.*\\.(?:png|jpg|jpeg|svg|gif|ico|json|js|css|woff2?)).*)",
  ],
};
