import { NextRequest, NextResponse } from "next/server";

/**
 * SSO gate (meld doc 14). With no session cookie, bounce to the standalone auth
 * app carrying return_to so the user lands back here after signing in. The cookie
 * is the parent-domain httpOnly session (SESSION_COOKIE_DOMAIN); in local dev use
 * shared *.lvh.me hosts so it's visible to this app. Layouts still resolve the
 * principal from /auth/check for role routing + a present-but-stale cookie.
 */
const COOKIE = "auth_token";

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  const url = new URL("/sign-in", authAppUrl);
  url.searchParams.set("return_to", req.nextUrl.href);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals, the PWA service-worker assets, and
  // static files (so the login bounce never blocks JS/CSS/icons).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-|worker-|fallback-|images/|icons/|.*\\.(?:png|jpg|jpeg|svg|gif|ico|json|js|css|woff2?)).*)",
  ],
};
