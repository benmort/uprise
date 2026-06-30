import { NextRequest, NextResponse } from "next/server";

/**
 * SSO gate (meld doc 14). With no session cookie, bounce to the standalone auth
 * app carrying return_to so the user lands back here after signing in. The cookie
 * is the parent-domain httpOnly session (SESSION_COOKIE_DOMAIN); in local dev use
 * shared *.lvh.me hosts so it's visible to this app. Layouts still resolve the
 * principal from /auth/check for role routing + a present-but-stale cookie.
 */
const COOKIE = "auth_token";

/**
 * This app's PUBLIC URL for the current request. Behind a proxy/tunnel (ngrok dev,
 * Vercel) `req.nextUrl` reflects the internal upstream (e.g. localhost:3000), so the
 * return_to must be rebuilt from the forwarded host/proto — otherwise the user is
 * sent back to localhost after signing in.
 */
function publicHref(req: NextRequest): string {
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const host = (fwdHost ?? req.nextUrl.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, ""))
    .split(",")[0]
    .trim();
  return `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  const url = new URL("/sign-in", authAppUrl);
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
